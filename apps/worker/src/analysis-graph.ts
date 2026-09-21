import { and, eq, isNull } from "drizzle-orm";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import {
	MAX_PARALLEL_INSPECTIONS,
	MAX_TOOL_CALLS_PER_TURN,
	ModelDiagnosisValidationError,
	OpenRouterProvider,
	createInconclusiveDiagnosis,
	repositoryToolDefinitions,
	describeTool,
	describeToolResult,
	hydrateDiagnosisEvidence,
	mapWithConcurrency,
	providerLocatorsMatch,
	validateDiagnosisEvidence,
	type AgentRunResult,
	type ChatMessage,
	type RawModelToolCall,
	type SnapshotIndex,
} from "@legwork/agent";
import {
	agentToolSchema,
	type AgentTool,
	type Diagnosis,
	type GitHubActivityTool,
	type InspectionOperation,
	type SandboxHandle,
	type SandboxRepositoryManifest,
	type ToolResult,
	type ProviderToolRequest,
	providerToolSchema,
	githubActivityToolSchema,
} from "@legwork/contracts";
import {
	analysisRuns,
	diagnoses,
	githubInstallations,
	incidents,
	organizations,
	reconcileUsage,
	repositories,
	serviceRepositories,
	services,
	providerConnections,
	serviceProviderBindings,
	externalIncidentLinks,
	type Database,
} from "@legwork/db";
import {
	GitHubActivityProvider,
	GitHubSourceProvider,
	type RepositoryDescriptor,
} from "@legwork/github";
import { activeSandboxes, destroyedSandboxes } from "@legwork/observability";
import { createSandboxProvider, type SandboxProviderKind } from "@legwork/sandbox";
import { redactSecrets } from "@legwork/security";
import { decryptSecret } from "@legwork/security";
import { investigationContextProviders, providerToolDefinitions } from "@legwork/integrations";

interface GraphRepository {
	repositoryId: string;
	githubRepositoryId: number;
	installationId: number;
	owner: string;
	name: string;
	defaultBranch: string;
	role: "primary" | "related";
	sha: string;
}

interface ValidatedToolCall {
	callId: string;
	index: number;
	tool: AgentTool | ProviderToolRequest | GitHubActivityTool;
}

interface IndexedToolResult {
	callId: string;
	index: number;
	result: ToolResult;
}

interface ReadSnapshot {
	repositoryId: string;
	path: string;
	start: number;
	end: number;
	output: string;
}

export interface IncidentAnalysisState {
	runId: string;
	organizationId: string;
	incidentId: string;
	incident?: unknown;
	serviceId?: string;
	phase:
		| "loading"
		| "resolving"
		| "provisioning"
		| "investigating"
		| "synthesizing"
		| "validating"
		| "persisting"
		| "cleaning_up"
		| "completed"
		| "failed";
	repositories: GraphRepository[];
	sandbox?: { id: string; createdAt: string; generation: number; prepared: boolean };
	messages: ChatMessage[];
	investigationTurn: number;
	invalidToolBatchCount: number;
	pendingToolCalls: RawModelToolCall[];
	validatedToolCalls: ValidatedToolCall[];
	toolResults: IndexedToolResult[];
	readSnapshots: ReadSnapshot[];
	providerBindings: Array<{
		connectionId: string;
		provider: "grafana" | "sentry";
		capabilities: Array<"logs" | "metrics" | "traces" | "issues" | "events" | "releases">;
		verified: boolean;
		allowedOperations?: string[];
	}>;
	providerContext?: {
		provider: "grafana" | "sentry";
		occurredAt: string;
		locator: Record<string, string>;
		release?: string;
	};
	providerSnapshots: Array<{
		callId: string;
		provider: "grafana" | "sentry" | "github";
		operation: string;
		locator: Record<string, string | number | boolean>;
		query?: string;
		windowStart?: string;
		windowEnd?: string;
		output: string;
		truncated: boolean;
	}>;
	diagnosis?: Diagnosis;
	validationErrors: string[];
	repairUsed: boolean;
	inputTokens: number;
	outputTokens: number;
	failure?: { code: string; message: string; retryable: boolean; node: string };
}

export interface IncidentAnalysisGraphDependencies {
	db: Database;
	githubAppId: string;
	githubPrivateKey: string;
	openRouterApiKey: string;
	model: string;
	sandboxProvider: SandboxProviderKind;
	commandExecutionEnabled: boolean;
	capabilityProbePassed: boolean;
	encryptionKey: string;
	expiresAt: Date;
	signal?: AbortSignal;
	recordActivity(activity: {
		kind: string;
		summary: string;
		detail?: string;
		toolName?: string;
		durationMs?: number;
		correlationId?: string;
	}): Promise<void>;
}

const GraphState = Annotation.Root({ data: Annotation<IncidentAnalysisState>() });

export const MAX_INVESTIGATION_TURNS = 20;
export const MAX_INVESTIGATION_TURNS_WITHOUT_PROVIDER = 10;

export function investigationTurnLimit(bindings: Array<{ verified: boolean }>): number {
	return bindings.some((binding) => binding.verified)
		? MAX_INVESTIGATION_TURNS
		: MAX_INVESTIGATION_TURNS_WITHOUT_PROVIDER;
}

// A full investigation turn traverses the model plus seven tool-pipeline nodes.
// Keep this above the longest bounded path (170 nodes today) while retaining a
// finite guard against accidental cycles.
export const ANALYSIS_GRAPH_RECURSION_LIMIT = 200;

function sourceProvider(
	state: IncidentAnalysisState,
	dependencies: IncidentAnalysisGraphDependencies,
) {
	const descriptors: RepositoryDescriptor[] = state.repositories.map((repository) => ({
		repositoryId: repository.repositoryId,
		githubRepositoryId: repository.githubRepositoryId,
		installationId: repository.installationId,
		owner: repository.owner,
		name: repository.name,
		defaultBranch: repository.defaultBranch,
	}));
	return new GitHubSourceProvider(
		{ appId: dependencies.githubAppId, privateKey: dependencies.githubPrivateKey },
		descriptors,
	);
}

function sandboxProvider(dependencies: IncidentAnalysisGraphDependencies) {
	return createSandboxProvider({
		kind: dependencies.sandboxProvider,
		commandExecutionEnabled: dependencies.commandExecutionEnabled,
		capabilityProbePassed: dependencies.capabilityProbePassed,
	});
}

function handle(state: IncidentAnalysisState): SandboxHandle {
	if (!state.sandbox?.prepared) throw new Error("SANDBOX_NOT_PREPARED");
	return { id: state.sandbox.id, createdAt: new Date(state.sandbox.createdAt) };
}

function snapshotIndex(state: IncidentAnalysisState): SnapshotIndex {
	return {
		hasRepository: (repositoryId) =>
			state.repositories.some((repository) => repository.repositoryId === repositoryId),
		readLines: async (repositoryId, path, start, end) => {
			const snapshot = state.readSnapshots.find(
				(candidate) =>
					candidate.repositoryId === repositoryId &&
					candidate.path === path &&
					candidate.start <= start &&
					candidate.end >= end,
			);
			if (!snapshot) return null;
			return snapshot.output
				.split("\n")
				.filter((line) => {
					const number = Number(line.match(/^(\d+):/)?.[1]);
					return number >= start && number <= end;
				})
				.join("\n");
		},
		readProvider: (evidence) =>
			(state.providerSnapshots ?? []).find(
				(snapshot) =>
					snapshot.provider === evidence.provider &&
					snapshot.operation === evidence.operation &&
					providerLocatorsMatch(snapshot.locator, evidence.locator) &&
					snapshot.query === evidence.query &&
					snapshot.windowStart === evidence.windowStart &&
					snapshot.windowEnd === evidence.windowEnd,
			)?.output ?? null,
	};
}

async function retryModel<T>(
	operation: () => Promise<T>,
	onRetry: (attempt: number) => Promise<void>,
) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const message = error instanceof Error ? error.message : "";
			const retryable =
				error instanceof TypeError ||
				/timeout|timed out|429|rate limit|provider unavailable|5\d\d/i.test(message);
			if (!retryable || attempt === 3) throw error;
			await onRetry(attempt + 1);
			await Bun.sleep(attempt * 1_000);
		}
	}
	throw lastError;
}
async function retryProvider<T>(operation: () => Promise<T>) {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const retryable =
				error instanceof TypeError ||
				(error && typeof error === "object" && "retryable" in error && error.retryable === true);
			if (!retryable || attempt === 3) throw error;
			await Bun.sleep(attempt * 1_000);
		}
	}
	throw lastError;
}

export function createIncidentAnalysisGraph(dependencies: IncidentAnalysisGraphDependencies) {
	const activity = dependencies.recordActivity;
	const instrument =
		(name: string, node: (state: IncidentAnalysisState) => Promise<IncidentAnalysisState>) =>
		async ({ data }: typeof GraphState.State) => {
			const started = performance.now();
			// Fresh per invocation so a retried node opens its own feed entry.
			const correlationId = crypto.randomUUID();
			await activity({
				kind: "node_started",
				summary: `${name} started`,
				detail: name,
				correlationId,
			});
			try {
				const next = await node(data);
				await activity({
					kind: "node_completed",
					summary: `${name} completed`,
					detail: name,
					durationMs: Math.round(performance.now() - started),
					correlationId,
				});
				return { data: next };
			} catch (error) {
				await activity({
					kind: "node_failed",
					summary: `${name} failed`,
					detail: error instanceof Error ? error.message.slice(0, 2_000) : "Node failed",
					durationMs: Math.round(performance.now() - started),
					correlationId,
				});
				throw error;
			}
		};

	const loadContext = instrument("load_context", async (state) => {
		const [record] = await dependencies.db
			.select({
				run: analysisRuns,
				incident: incidents,
				service: services,
				organization: organizations,
			})
			.from(analysisRuns)
			.innerJoin(
				incidents,
				and(
					eq(incidents.id, analysisRuns.incidentId),
					eq(incidents.organizationId, analysisRuns.organizationId),
				),
			)
			.innerJoin(
				services,
				and(
					eq(services.id, incidents.serviceId),
					eq(services.organizationId, analysisRuns.organizationId),
				),
			)
			.innerJoin(organizations, eq(organizations.id, analysisRuns.organizationId))
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			)
			.limit(1);
		if (!record) throw new Error("ANALYSIS_CONTEXT_NOT_FOUND");
		const connected = await dependencies.db
			.select({
				repositoryId: repositories.id,
				githubRepositoryId: repositories.githubRepositoryId,
				installationId: githubInstallations.installationId,
				owner: repositories.owner,
				name: repositories.name,
				defaultBranch: repositories.defaultBranch,
				role: serviceRepositories.role,
			})
			.from(serviceRepositories)
			.innerJoin(
				repositories,
				and(
					eq(repositories.id, serviceRepositories.repositoryId),
					eq(repositories.organizationId, state.organizationId),
				),
			)
			.innerJoin(
				githubInstallations,
				and(
					eq(githubInstallations.id, repositories.githubInstallationId),
					eq(githubInstallations.organizationId, state.organizationId),
				),
			)
			.where(
				and(
					eq(serviceRepositories.serviceId, record.service.id),
					eq(serviceRepositories.organizationId, state.organizationId),
				),
			);
		const bindings = await dependencies.db
			.select({
				connectionId: providerConnections.id,
				provider: providerConnections.provider,
				capabilities: providerConnections.capabilities,
				verifiedAt: providerConnections.lastVerifiedAt,
				queryPolicy: serviceProviderBindings.queryPolicy,
			})
			.from(serviceProviderBindings)
			.innerJoin(
				providerConnections,
				and(
					eq(providerConnections.id, serviceProviderBindings.connectionId),
					eq(providerConnections.organizationId, state.organizationId),
					eq(providerConnections.enabled, true),
				),
			)
			.where(
				and(
					eq(serviceProviderBindings.serviceId, record.service.id),
					eq(serviceProviderBindings.organizationId, state.organizationId),
					eq(serviceProviderBindings.enabled, true),
				),
			);
		const [external] = await dependencies.db
			.select({
				provider: externalIncidentLinks.provider,
				context: externalIncidentLinks.providerContext,
			})
			.from(externalIncidentLinks)
			.where(
				and(
					eq(externalIncidentLinks.incidentId, record.incident.id),
					eq(externalIncidentLinks.organizationId, state.organizationId),
				),
			)
			.limit(1);
		if (connected.length > 3 || !connected.some(({ role }) => role === "primary"))
			throw new Error("INVALID_SERVICE_REPOSITORY_MAPPING");
		if (connected.some(({ installationId }) => installationId <= 0))
			throw new Error("GITHUB_INSTALLATION_UNAVAILABLE");
		await dependencies.db
			.update(analysisRuns)
			.set({
				status: "provisioning",
				failureCode: null,
				failureMessage: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			);
		return {
			...state,
			incidentId: record.incident.id,
			incident: redactSecrets(record.incident.payload),
			serviceId: record.service.id,
			phase: "resolving",
			repositories: connected.map((repository) => ({ ...repository, sha: "" })),
			providerBindings: bindings.map((binding) => ({
				connectionId: binding.connectionId,
				provider: binding.provider,
				capabilities: binding.capabilities,
				verified: Boolean(binding.verifiedAt),
				...(Array.isArray(binding.queryPolicy.allowedOperations)
					? {
							allowedOperations: binding.queryPolicy.allowedOperations.filter(
								(item): item is string => typeof item === "string",
							),
						}
					: {}),
			})),
			...(external
				? {
						providerContext: {
							provider: external.provider,
							occurredAt: record.incident.occurredAt.toISOString(),
							locator: Object.fromEntries(
								Object.entries(external.context.context).filter(
									(entry): entry is [string, string] => typeof entry[1] === "string",
								),
							),
							...(typeof external.context.context.release === "string"
								? { release: external.context.context.release }
								: {}),
						},
					}
				: {}),
			messages: [
				{
					role: "user",
					content: JSON.stringify({
						task: "Diagnose this incident",
						incident: redactSecrets(record.incident.payload),
					}),
				},
			],
		};
	});

	const resolveRevisions = instrument("resolve_revisions", async (state) => {
		if (state.repositories.every(({ sha }) => /^[0-9a-f]{40}$/.test(sha)))
			return { ...state, phase: "investigating" };
		const source = sourceProvider(state, dependencies);
		const requestedSha = (state.incident as { primaryCommitSha?: string } | undefined)
			?.primaryCommitSha;
		const repositoriesWithSha = await Promise.all(
			state.repositories.map(async (repository) => ({
				...repository,
				sha: await source.resolveRevision(
					repository.repositoryId,
					repository.role === "primary" ? requestedSha : undefined,
				),
			})),
		);
		await dependencies.db
			.update(analysisRuns)
			.set({
				resolvedRevisions: repositoriesWithSha.map(
					({ repositoryId, githubRepositoryId, role, sha }) => ({
						repositoryId,
						githubRepositoryId,
						role,
						sha,
					}),
				),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			);
		return {
			...state,
			phase: "investigating",
			repositories: repositoriesWithSha,
			messages: state.messages.map((message, index) =>
				index === 0
					? {
							...message,
							content: JSON.stringify({
								task: "Diagnose this incident",
								incident: state.incident,
								repositories: repositoriesWithSha.map(({ repositoryId, sha }) => ({
									repositoryId,
									sha,
								})),
								observability: {
									verifiedProviders: state.providerBindings
										.filter((binding) => binding.verified)
										.map((binding) => binding.provider),
								},
							}),
						}
					: message,
			),
		};
	});

	const investigationModel = instrument("investigation_model", async (state) => {
		const turnLimit = investigationTurnLimit(state.providerBindings);
		if (state.investigationTurn >= turnLimit) {
			await activity({
				kind: "investigation_budget_reached",
				summary: state.providerBindings.some((binding) => binding.verified)
					? "Moving to diagnosis after reaching the investigation limit"
					: "Moving to diagnosis because no verified observability source is connected",
				detail: JSON.stringify({ investigationTurns: state.investigationTurn, turnLimit }),
			});
			return { ...state, pendingToolCalls: [], phase: "synthesizing" };
		}
		const model = new OpenRouterProvider(dependencies.openRouterApiKey, dependencies.model);
		const started = performance.now();
		const result = await retryModel(
			() =>
				model.continueAgent(
					state.messages,
					[
						...repositoryToolDefinitions(!model.model.startsWith("openai/gpt-5.6-")),
						...providerToolDefinitions(
							(state.providerBindings ?? []).map((binding) => ({ ...binding, enabled: true })),
						),
					],
					dependencies.signal,
				),
			async (attempt) =>
				activity({
					kind: "node_retried",
					summary: `Retrying investigation model request (attempt ${attempt}/3)`,
					detail: JSON.stringify({ model: model.model, reasoningEffort: "medium", attempt }),
				}),
		);
		await activity({
			kind: "assistant_message",
			summary: result.rawToolCalls.length
				? `The model requested ${result.rawToolCalls.length} tools`
				: "The model finished its investigation",
			detail: JSON.stringify(
				{ model: model.model, reasoningEffort: "medium", message: result.message },
				null,
				2,
			),
			durationMs: Math.round(performance.now() - started),
		});
		return {
			...state,
			phase: result.rawToolCalls.length ? "investigating" : "synthesizing",
			messages: [...state.messages, result.message],
			pendingToolCalls: result.rawToolCalls,
			validatedToolCalls: [],
			toolResults: [],
			investigationTurn: state.investigationTurn + 1,
			inputTokens: state.inputTokens + result.usage.inputTokens,
			outputTokens: state.outputTokens + result.usage.outputTokens,
		};
	});

	const validateToolBatch = instrument("validate_tool_batch", async (state) => {
		const errors: string[] = [];
		const availableProviderTools = new Set(
			providerToolDefinitions(
				(state.providerBindings ?? []).map((binding) => ({ ...binding, enabled: true })),
			).map((definition) => definition.function.name),
		);
		if (state.pendingToolCalls.length > MAX_TOOL_CALLS_PER_TURN)
			errors.push(`Maximum ${MAX_TOOL_CALLS_PER_TURN} tool calls are allowed per turn`);
		if (
			new Set(state.pendingToolCalls.map(({ callId }) => callId)).size !==
			state.pendingToolCalls.length
		)
			errors.push("Tool call IDs must be unique");
		const validated: ValidatedToolCall[] = [];
		for (const [index, call] of state.pendingToolCalls.entries()) {
			try {
				if (
					(call.name.startsWith("grafana_") || call.name.startsWith("sentry_")) &&
					!availableProviderTools.has(call.name)
				)
					throw new Error("Tool is not available for this incident");
				const argumentsValue = JSON.parse(call.arguments) as Record<string, unknown>;
				const candidate = { name: call.name, ...argumentsValue };
				validated.push({
					callId: call.callId,
					index,
					tool:
						call.name.startsWith("grafana_") || call.name.startsWith("sentry_")
							? providerToolSchema.parse(candidate)
							: call.name === "github_recent_activity"
								? githubActivityToolSchema.parse(candidate)
								: agentToolSchema.parse(candidate),
				});
			} catch (error) {
				errors.push(
					`${call.name || "unknown tool"}: ${error instanceof Error ? error.message : "invalid arguments"}`,
				);
			}
		}
		if (validated.filter(({ tool }) => tool.name === "run_check").length > 1)
			errors.push("At most one repository check is allowed per turn");
		if (
			validated.filter(
				({ tool }) => tool.name.startsWith("grafana_") || tool.name.startsWith("sentry_"),
			).length > 4
		)
			errors.push("At most four provider calls are allowed per turn");
		if (errors.length === 0) return { ...state, validatedToolCalls: validated };
		const invalidToolBatchCount = state.invalidToolBatchCount + 1;
		await activity({
			kind: "tool_batch_rejected",
			summary: `Rejected invalid model tool batch (${invalidToolBatchCount}/3)`,
			detail: errors.join("\n").slice(0, 4_000),
		});
		if (invalidToolBatchCount >= 3) {
			const error = new Error("MODEL_TOOL_BATCH_INVALID");
			Object.assign(error, { code: "MODEL_TOOL_BATCH_INVALID" });
			throw error;
		}
		return {
			...state,
			invalidToolBatchCount,
			messages: [
				...state.messages,
				...state.pendingToolCalls.map((call) => ({
					role: "tool" as const,
					tool_call_id: call.callId,
					content: JSON.stringify({ status: "error", error: "Tool batch rejected", errors }),
				})),
			],
			pendingToolCalls: [],
			validatedToolCalls: [],
			toolResults: [],
		};
	});

	const ensureSandbox = instrument("ensure_sandbox", async (state) => {
		if (
			!state.validatedToolCalls.some(({ tool }) =>
				["list_tree", "search_code", "read_file", "run_check"].includes(tool.name),
			)
		)
			return state;
		const provider = sandboxProvider(dependencies);
		if (state.sandbox) {
			const existing = { id: state.sandbox.id, createdAt: new Date(state.sandbox.createdAt) };
			if (state.sandbox.prepared && (await provider.health(existing)) === "ready") return state;
			await provider.destroy(existing).catch(() => undefined);
			await activity({
				kind: "sandbox_replaced",
				summary: `Replacing unavailable sandbox generation ${state.sandbox.generation}`,
			});
		}
		const generation = (state.sandbox?.generation ?? 0) + 1;
		const source = sourceProvider(state, dependencies);
		const downloads = await Promise.all(
			state.repositories.map(({ repositoryId, sha }) =>
				source.createArchiveDownload(repositoryId, sha),
			),
		);
		await activity({
			kind: "sandbox_provisioning",
			summary: `Provisioning isolated sandbox generation ${generation}`,
			detail: JSON.stringify({
				repositories: state.repositories.map(({ repositoryId, sha }) => ({ repositoryId, sha })),
			}),
		});
		const created = await provider.create({
			runId: `${state.runId}-${generation}`,
			organizationId: state.organizationId,
			repositories: state.repositories,
		});
		activeSandboxes.inc();
		await dependencies.db
			.update(analysisRuns)
			.set({ sandboxId: created.id, updatedAt: new Date() })
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			);
		const manifest: SandboxRepositoryManifest = {
			repositories: downloads.map(({ repositoryId, sha, url }) => ({
				repositoryId,
				sha,
				downloadUrl: url,
			})),
		};
		try {
			await provider.prepareRepositories(
				created,
				manifest,
				Buffer.from(JSON.stringify(state.incident, null, 2)),
				(progress) => {
					void activity({
						kind: `sandbox_${progress.phase}`,
						summary:
							progress.phase === "ready"
								? `${progress.repositoryCount} repositories ready in sandbox generation ${generation}`
								: `${progress.phase === "downloading" ? "Downloading" : "Extracting"} repository ${progress.repositoryId} (${progress.index}/${progress.total})`,
						detail: JSON.stringify(progress),
					});
				},
			);
		} catch (error) {
			await provider.destroy(created).catch(() => undefined);
			activeSandboxes.dec();
			throw error;
		}
		await dependencies.db
			.update(analysisRuns)
			.set({ status: "analyzing", updatedAt: new Date() })
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			);
		return {
			...state,
			phase: "investigating",
			sandbox: {
				id: created.id,
				createdAt: created.createdAt.toISOString(),
				generation,
				prepared: true,
			},
		};
	});

	const executeStaticTools = instrument("execute_static_tools", async (state) => {
		const provider = sandboxProvider(dependencies);
		const staticCalls = state.validatedToolCalls.filter(
			(call): call is ValidatedToolCall & { tool: InspectionOperation } =>
				["list_tree", "search_code", "read_file"].includes(call.tool.name),
		);
		const results = [...state.toolResults];
		const snapshots = [...state.readSnapshots];
		await mapWithConcurrency(staticCalls, MAX_PARALLEL_INSPECTIONS, async (call) => {
			await activity({
				kind: "tool_started",
				summary: describeTool(call.tool),
				detail: JSON.stringify(call.tool, null, 2),
				toolName: call.tool.name,
				correlationId: call.callId,
			});
			const result = await provider.inspect(handle(state), call.tool);
			results.push({ callId: call.callId, index: call.index, result });
			if (call.tool.name === "read_file" && result.status === "ok") {
				const next = {
					repositoryId: call.tool.repositoryId,
					path: call.tool.path,
					start: call.tool.start,
					end: call.tool.end,
					output: result.output,
				};
				const index = snapshots.findIndex(
					(snapshot) =>
						snapshot.repositoryId === next.repositoryId &&
						snapshot.path === next.path &&
						snapshot.start === next.start &&
						snapshot.end === next.end,
				);
				if (index === -1) snapshots.push(next);
				else snapshots[index] = next;
			}
			await activity({
				kind: "tool_completed",
				summary: describeToolResult(call.tool, result),
				detail: JSON.stringify(result, null, 2),
				toolName: call.tool.name,
				durationMs: result.durationMs,
				correlationId: call.callId,
			});
			return result;
		});
		return { ...state, toolResults: results, readSnapshots: snapshots };
	});

	const executeCheck = instrument("execute_check", async (state) => {
		const call = state.validatedToolCalls.find(({ tool }) => tool.name === "run_check");
		if (!call || call.tool.name !== "run_check") return state;
		const provider = sandboxProvider(dependencies);
		await activity({
			kind: "tool_started",
			summary: describeTool(call.tool),
			detail: JSON.stringify(call.tool, null, 2),
			toolName: call.tool.name,
			correlationId: call.callId,
		});
		const result = await provider.runCheck(handle(state), call.tool);
		await activity({
			kind: "tool_completed",
			summary: describeToolResult(call.tool, result),
			detail: JSON.stringify(result, null, 2),
			toolName: call.tool.name,
			durationMs: result.durationMs,
			correlationId: call.callId,
		});
		return {
			...state,
			toolResults: [...state.toolResults, { callId: call.callId, index: call.index, result }],
		};
	});

	const executeGitHubTools = instrument("execute_github_tools", async (state) => {
		const calls = state.validatedToolCalls.filter(
			(call) => call.tool.name === "github_recent_activity",
		);
		if (!calls.length) return state;
		const provider = new GitHubActivityProvider(
			{ appId: dependencies.githubAppId, privateKey: dependencies.githubPrivateKey },
			state.repositories,
		);
		const results = [...state.toolResults];
		const snapshots = [...state.providerSnapshots];
		await mapWithConcurrency(calls, 4, async (call) => {
			if (call.tool.name !== "github_recent_activity") return;
			await activity({
				kind: "tool_started",
				summary: `Reading the last ${call.tool.lookbackHours} hours of GitHub activity`,
				detail: JSON.stringify(call.tool, null, 2),
				toolName: call.tool.name,
				correlationId: call.callId,
			});
			const result = await provider.recentActivity(
				call.tool.repositoryId,
				call.tool.lookbackHours,
				dependencies.signal,
			);
			results.push({ callId: call.callId, index: call.index, result });
			if (result.status === "ok")
				snapshots.push({
					callId: call.callId,
					provider: "github",
					operation: call.tool.name,
					locator: {
						repositoryId: call.tool.repositoryId,
						lookbackHours: call.tool.lookbackHours,
					},
					output: result.output,
					truncated: result.truncated,
				});
			await activity({
				kind: "tool_completed",
				summary:
					result.status === "ok"
						? "Read recent GitHub Actions and deployment activity"
						: `GitHub activity unavailable${result.limitation ? ` — ${result.limitation}` : ""}`,
				detail: JSON.stringify(result, null, 2),
				toolName: call.tool.name,
				durationMs: result.durationMs,
				correlationId: call.callId,
			});
		});
		return { ...state, toolResults: results, providerSnapshots: snapshots };
	});

	const executeProviderTools = instrument("execute_provider_tools", async (state) => {
		const calls = state.validatedToolCalls.filter(
			(call) => call.tool.name.startsWith("grafana_") || call.tool.name.startsWith("sentry_"),
		);
		if (!calls.length) return state;
		const results = [...state.toolResults];
		const snapshots = [...(state.providerSnapshots ?? [])];
		await mapWithConcurrency(calls, 4, async (call) => {
			const providerKind = call.tool.name.startsWith("grafana_") ? "grafana" : "sentry";
			const binding = state.providerBindings.find(
				(candidate) => candidate.provider === providerKind,
			);
			let result: ToolResult;
			if (!binding || !state.providerContext)
				result = {
					status: "unavailable",
					output: "Provider context is not linked to this incident",
					truncated: false,
					durationMs: 0,
					limitation: "PROVIDER_CONNECTION_DISABLED",
				};
			else {
				const providerContext = state.providerContext;
				const [record] = await dependencies.db
					.select()
					.from(providerConnections)
					.where(
						and(
							eq(providerConnections.id, binding.connectionId),
							eq(providerConnections.organizationId, state.organizationId),
							eq(providerConnections.enabled, true),
						),
					)
					.limit(1);
				if (!record)
					result = {
						status: "unavailable",
						output: "Provider connection is unavailable",
						truncated: false,
						durationMs: 0,
						limitation: "PROVIDER_CONNECTION_DISABLED",
					};
				else {
					const started = performance.now();
					try {
						const credential = JSON.parse(
							decryptSecret(
								record.credentialsCiphertext,
								dependencies.encryptionKey,
								`provider-connection:${record.id}:credentials`,
							),
						);
						const providerResult = await retryProvider(() =>
							investigationContextProviders[providerKind].execute(
								{
									id: record.id,
									organizationId: record.organizationId,
									config: record.config,
									credential,
									capabilities: record.capabilities,
								},
								call.tool as ProviderToolRequest,
								{
									incidentId: state.incidentId,
									occurredAt: providerContext.occurredAt,
									provider: providerKind,
									locator: providerContext.locator,
									...(providerContext.release ? { release: providerContext.release } : {}),
								},
								dependencies.signal,
							),
						);
						result = {
							status: providerResult.status,
							output: providerResult.output,
							truncated: providerResult.truncated,
							durationMs: Math.round(performance.now() - started),
							...(providerResult.limitation ? { limitation: providerResult.limitation } : {}),
						};
						if (providerResult.status === "ok")
							snapshots.push({
								callId: call.callId,
								provider: providerKind,
								operation: providerResult.operation,
								locator: providerResult.locator,
								...(providerResult.query ? { query: providerResult.query } : {}),
								...(providerResult.windowStart ? { windowStart: providerResult.windowStart } : {}),
								...(providerResult.windowEnd ? { windowEnd: providerResult.windowEnd } : {}),
								output: providerResult.output,
								truncated: providerResult.truncated,
							});
					} catch (error) {
						result = {
							status: "error",
							output: "Provider request failed",
							truncated: false,
							durationMs: Math.round(performance.now() - started),
							limitation:
								error && typeof error === "object" && "code" in error
									? String(error.code)
									: "PROVIDER_UNAVAILABLE",
						};
					}
				}
			}
			results.push({ callId: call.callId, index: call.index, result });
			return result;
		});
		let remainingBytes = 128 * 1_024;
		for (const item of results
			.filter((candidate) => calls.some((call) => call.callId === candidate.callId))
			.sort((left, right) => left.index - right.index)) {
			const bytes = Buffer.from(item.result.output);
			const allowed = Math.max(0, Math.min(bytes.length, remainingBytes));
			if (allowed < bytes.length)
				item.result = {
					...item.result,
					output: bytes.subarray(0, allowed).toString("utf8"),
					truncated: true,
				};
			remainingBytes -= allowed;
			const snapshot = snapshots.find((candidate) => candidate.callId === item.callId);
			if (snapshot) {
				snapshot.output = item.result.output;
				snapshot.truncated = item.result.truncated;
			}
		}
		return { ...state, toolResults: results, providerSnapshots: snapshots };
	});

	const appendToolResults = instrument("append_tool_results", async (state) => {
		const ordered = [...state.toolResults].sort((left, right) => left.index - right.index);
		if (
			ordered.length !== state.validatedToolCalls.length ||
			ordered.some((result, index) => result.index !== index)
		)
			throw new Error("MODEL_TOOL_PROTOCOL_INCOMPLETE");
		return {
			...state,
			messages: [
				...state.messages,
				...ordered.map(({ callId, result }) => ({
					role: "tool" as const,
					tool_call_id: callId,
					content: JSON.stringify(result),
				})),
			],
			pendingToolCalls: [],
			validatedToolCalls: [],
			toolResults: [],
		};
	});

	const synthesize = instrument("synthesize_diagnosis", async (state) => {
		const model = new OpenRouterProvider(dependencies.openRouterApiKey, dependencies.model);
		let result;
		let repairUsed = state.repairUsed;
		let rejectedInputTokens = 0;
		let rejectedOutputTokens = 0;
		try {
			result = await retryModel(
				() => model.createDiagnosis(state.messages, undefined, dependencies.signal),
				async (attempt) =>
					activity({
						kind: "node_retried",
						summary: `Retrying diagnosis synthesis (attempt ${attempt}/3)`,
						detail: JSON.stringify({ model: model.model, reasoningEffort: "medium", attempt }),
					}),
			);
		} catch (error) {
			if (!(error instanceof ModelDiagnosisValidationError)) throw error;
			rejectedInputTokens = error.usage.inputTokens;
			rejectedOutputTokens = error.usage.outputTokens;
			await activity({
				kind: "validation",
				summary: "Structured diagnosis was invalid; requesting the single repair",
				detail: error.message,
			});
			try {
				result = await model.createDiagnosis(state.messages, error.message, dependencies.signal);
				repairUsed = true;
			} catch (repairError) {
				if (!(repairError instanceof ModelDiagnosisValidationError)) throw repairError;
				await activity({
					kind: "validation",
					summary: "The corrected diagnosis was still malformed; returning a safe result",
					detail: repairError.message.slice(0, 16_000),
				});
				return {
					...state,
					phase: "validating",
					diagnosis: createInconclusiveDiagnosis("model_output_invalid"),
					repairUsed: true,
					inputTokens: state.inputTokens + rejectedInputTokens + repairError.usage.inputTokens,
					outputTokens: state.outputTokens + rejectedOutputTokens + repairError.usage.outputTokens,
				};
			}
		}
		return {
			...state,
			phase: "validating",
			diagnosis: result.diagnosis,
			repairUsed,
			inputTokens: state.inputTokens + rejectedInputTokens + result.usage.inputTokens,
			outputTokens: state.outputTokens + rejectedOutputTokens + result.usage.outputTokens,
		};
	});

	const hydrate = instrument("hydrate_evidence", async (state) => {
		if (!state.diagnosis) throw new Error("MODEL_DIAGNOSIS_MISSING");
		return {
			...state,
			diagnosis: await hydrateDiagnosisEvidence(state.diagnosis, snapshotIndex(state)),
		};
	});

	const validate = instrument("validate_diagnosis", async (state) => {
		if (!state.diagnosis) throw new Error("MODEL_DIAGNOSIS_MISSING");
		const validationErrors = await validateDiagnosisEvidence(state.diagnosis, snapshotIndex(state));
		return { ...state, validationErrors };
	});

	const repair = instrument("repair_diagnosis", async (state) => {
		if (state.repairUsed) {
			await activity({
				kind: "validation",
				summary: "Evidence validation still failed; returning a safe result",
				detail: state.validationErrors.join("\n").slice(0, 16_000),
			});
			return {
				...state,
				diagnosis: createInconclusiveDiagnosis("evidence_unverified"),
				validationErrors: [],
			};
		}
		const model = new OpenRouterProvider(dependencies.openRouterApiKey, dependencies.model);
		try {
			const result = await retryModel(
				() =>
					model.createDiagnosis(
						state.messages,
						state.validationErrors.join("; "),
						dependencies.signal,
					),
				async (attempt) =>
					activity({
						kind: "node_retried",
						summary: `Retrying diagnosis repair (attempt ${attempt}/3)`,
					}),
			);
			return {
				...state,
				diagnosis: result.diagnosis,
				repairUsed: true,
				validationErrors: [],
				inputTokens: state.inputTokens + result.usage.inputTokens,
				outputTokens: state.outputTokens + result.usage.outputTokens,
			};
		} catch (error) {
			if (!(error instanceof ModelDiagnosisValidationError)) throw error;
			await activity({
				kind: "validation",
				summary: "The corrected diagnosis was malformed; returning a safe result",
				detail: error.message.slice(0, 16_000),
			});
			return {
				...state,
				diagnosis: createInconclusiveDiagnosis("model_output_invalid"),
				repairUsed: true,
				validationErrors: [],
				inputTokens: state.inputTokens + error.usage.inputTokens,
				outputTokens: state.outputTokens + error.usage.outputTokens,
			};
		}
	});

	const persist = instrument("persist_result", async (state) => {
		if (!state.diagnosis) throw new Error("MODEL_DIAGNOSIS_MISSING");
		if (state.validationErrors.length > 0)
			await activity({
				kind: "validation",
				summary: "Evidence validation failed; returning a safe result",
				detail: state.validationErrors.join("\n").slice(0, 16_000),
			});
		const diagnosis =
			state.validationErrors.length > 0
				? createInconclusiveDiagnosis("evidence_unverified")
				: state.diagnosis;
		const status = diagnosis.status === "diagnosed" ? "completed" : "inconclusive";
		await dependencies.db.transaction(async (tx) => {
			await tx
				.insert(diagnoses)
				.values({
					organizationId: state.organizationId,
					runId: state.runId,
					diagnosis,
					expiresAt: dependencies.expiresAt,
				})
				.onConflictDoUpdate({ target: diagnoses.runId, set: { diagnosis } });
			await tx
				.update(analysisRuns)
				.set({
					status,
					completedAt: new Date(),
					failureCode: null,
					failureMessage: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(analysisRuns.id, state.runId),
						eq(analysisRuns.organizationId, state.organizationId),
					),
				);
			await tx
				.update(organizations)
				.set({ activatedAt: new Date() })
				.where(and(eq(organizations.id, state.organizationId), isNull(organizations.activatedAt)));
		});
		await reconcileUsage(
			dependencies.db,
			state.organizationId,
			state.runId,
			state.inputTokens,
			state.outputTokens,
		);
		await activity({
			kind: "completed",
			summary: `Persisted ${status} analysis result with validated evidence`,
			detail: JSON.stringify({ inputTokens: state.inputTokens, outputTokens: state.outputTokens }),
		});
		return { ...state, diagnosis, phase: "cleaning_up" };
	});

	const cleanup = instrument("cleanup_sandbox", async (state) => {
		if (state.sandbox) {
			await sandboxProvider(dependencies)
				.destroy({ id: state.sandbox.id, createdAt: new Date(state.sandbox.createdAt) })
				.catch(async (error) => {
					await activity({
						kind: "sandbox_cleanup_warning",
						summary: "Sandbox cleanup failed; the janitor will retry",
						detail: error instanceof Error ? error.message.slice(0, 2_000) : "Cleanup failed",
					});
				});
			destroyedSandboxes.inc({ reason: "langgraph_cleanup" });
			activeSandboxes.dec();
		}
		await dependencies.db
			.update(analysisRuns)
			.set({ sandboxId: null, updatedAt: new Date() })
			.where(
				and(
					eq(analysisRuns.id, state.runId),
					eq(analysisRuns.organizationId, state.organizationId),
				),
			);
		const { sandbox: _sandbox, ...withoutSandbox } = state;
		return { ...withoutSandbox, phase: "completed" };
	});

	return (
		new StateGraph(GraphState)
			.addNode("load_context", loadContext)
			.addNode("resolve_revisions", resolveRevisions)
			.addNode("investigation_model", investigationModel)
			.addNode("validate_tool_batch", validateToolBatch)
			.addNode("ensure_sandbox", ensureSandbox)
			.addNode("execute_static_tools", executeStaticTools)
			.addNode("execute_check", executeCheck)
			.addNode("execute_github_tools", executeGitHubTools)
			.addNode("execute_provider_tools", executeProviderTools)
			.addNode("append_tool_results", appendToolResults)
			.addNode("synthesize_diagnosis", synthesize)
			.addNode("hydrate_evidence", hydrate)
			.addNode("validate_diagnosis", validate)
			.addNode("repair_diagnosis", repair)
			.addNode("persist_result", persist)
			.addNode("cleanup_sandbox", cleanup)
			.addEdge(START, "load_context")
			.addEdge("load_context", "resolve_revisions")
			.addEdge("resolve_revisions", "investigation_model")
			.addConditionalEdges(
				"investigation_model",
				({ data }) => (data.pendingToolCalls.length ? "tools" : "synthesis"),
				{ tools: "validate_tool_batch", synthesis: "synthesize_diagnosis" },
			)
			.addConditionalEdges(
				"validate_tool_batch",
				({ data }) => (data.validatedToolCalls.length ? "valid" : "invalid"),
				{ valid: "ensure_sandbox", invalid: "investigation_model" },
			)
			.addEdge("ensure_sandbox", "execute_static_tools")
			.addEdge("execute_static_tools", "execute_check")
			.addEdge("execute_check", "execute_github_tools")
			.addEdge("execute_github_tools", "execute_provider_tools")
			.addEdge("execute_provider_tools", "append_tool_results")
			.addEdge("append_tool_results", "investigation_model")
			// Validation must run against the model's claimed excerpts BEFORE
			// hydration replaces them with real snapshot text; the old
			// hydrate-then-validate order made the excerpt check pass by
			// construction and could not detect fabricated citations.
			.addEdge("synthesize_diagnosis", "validate_diagnosis")
			.addConditionalEdges(
				"validate_diagnosis",
				({ data }) => {
					if (data.validationErrors.length === 0) return "valid";
					return data.repairUsed ? "inconclusive" : "repair";
				},
				{ valid: "hydrate_evidence", repair: "repair_diagnosis", inconclusive: "persist_result" },
			)
			.addEdge("hydrate_evidence", "persist_result")
			.addEdge("repair_diagnosis", "validate_diagnosis")
			.addEdge("persist_result", "cleanup_sandbox")
			.addEdge("cleanup_sandbox", END)
	);
}

export async function runIncidentAnalysisGraph(
	input: { runId: string; organizationId: string },
	dependencies: IncidentAnalysisGraphDependencies,
	checkpointer: BaseCheckpointSaver,
): Promise<AgentRunResult> {
	const graph = createIncidentAnalysisGraph(dependencies).compile({ checkpointer });
	const config = { configurable: { thread_id: input.runId } };
	const existing = await graph.getState(config);
	const initial: { data: IncidentAnalysisState } | null = existing.values.data
		? null
		: {
				data: {
					runId: input.runId,
					organizationId: input.organizationId,
					incidentId: "",
					phase: "loading",
					repositories: [],
					messages: [],
					investigationTurn: 0,
					invalidToolBatchCount: 0,
					pendingToolCalls: [],
					validatedToolCalls: [],
					toolResults: [],
					readSnapshots: [],
					providerBindings: [],
					providerSnapshots: [],
					validationErrors: [],
					repairUsed: false,
					inputTokens: 0,
					outputTokens: 0,
				},
			};
	if (!initial)
		await dependencies.recordActivity({
			kind: "graph_resumed",
			summary: "Resuming analysis from the latest durable LangGraph checkpoint",
		});
	const output = await graph.invoke(initial, {
		...config,
		recursionLimit: ANALYSIS_GRAPH_RECURSION_LIMIT,
	});
	await dependencies.recordActivity({
		kind: "graph_checkpointed",
		summary: "Analysis graph reached its terminal durable checkpoint",
	});
	return {
		diagnosis: output.data.diagnosis ?? createInconclusiveDiagnosis("analysis_incomplete"),
		inputTokens: output.data.inputTokens,
		outputTokens: output.data.outputTokens,
	};
}
