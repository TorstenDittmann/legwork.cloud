import type {
	AgentTool,
	Diagnosis,
	InspectionOperation,
	SandboxHandle,
	SandboxProvider,
	ToolResult,
} from "@legwork/contracts";
import { agentToolSchema } from "@legwork/contracts";
import type { SnapshotIndex } from "./evidence";
import { hydrateDiagnosisEvidence, validateDiagnosisEvidence } from "./evidence";
import { createInconclusiveDiagnosis } from "./inconclusive";
import type { ChatMessage, DiagnosisModelProvider } from "./openrouter";
import {
	MAX_TOOL_CALLS_PER_TURN,
	ModelCheckCallLimitError,
	ModelDiagnosisValidationError,
	ModelToolCallLimitError,
} from "./openrouter";
import { AGENT_SYSTEM_PROMPT, FINAL_SYSTEM_PROMPT } from "./prompt";

export const MAX_PARALLEL_INSPECTIONS = 4;

export interface AgentActivity {
	sequence: number;
	kind: string;
	summary: string;
	detail?: string;
	toolName?: string;
	durationMs?: number;
	/** Ties a `*_started` activity to its `*_completed`/`*_failed` counterpart. */
	correlationId?: string;
}
export interface AgentRunInput {
	incident: unknown;
	repositories: Array<{ repositoryId: string; sha: string }>;
	sandbox: SandboxHandle;
	sandboxProvider: SandboxProvider;
	snapshot: SnapshotIndex;
	onActivity(activity: AgentActivity): Promise<void>;
	signal?: AbortSignal;
}

export interface AgentRunResult {
	diagnosis: Diagnosis;
	inputTokens: number;
	outputTokens: number;
}

function compact(value: string, maximum = 160): string {
	const normalized = value.replaceAll(/\s+/g, " ").trim();
	return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

export function describeTool(tool: AgentTool): string {
	if (tool.name === "list_tree") return `Listing ${tool.path} to depth ${tool.depth}`;
	if (tool.name === "search_code")
		return `Searching for “${compact(tool.query)}”${tool.glob ? ` in ${tool.glob}` : ""}`;
	if (tool.name === "read_file") return `Reading ${tool.path}, lines ${tool.start}–${tool.end}`;
	return `Running the repository ${tool.check} check`;
}

export function describeToolResult(tool: AgentTool, result: ToolResult): string {
	const lines = result.output ? result.output.split("\n").length : 0;
	const suffix = result.truncated ? ", output truncated" : "";
	if (result.status !== "ok")
		return `${describeTool(tool)}: ${result.status}${result.limitation ? ` — ${compact(result.limitation)}` : ""}`;
	if (tool.name === "list_tree") return `Listed ${lines} entries from ${tool.path}${suffix}`;
	if (tool.name === "search_code") return `Search returned ${lines} matching lines${suffix}`;
	if (tool.name === "read_file") return `Read ${lines} lines from ${tool.path}${suffix}`;
	return `${tool.check} check completed successfully${suffix}`;
}

export async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (concurrency < 1) throw new Error("Concurrency must be positive");
	const results = Array.from<R>({ length: items.length });
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			const item = items[index];
			if (item !== undefined) results[index] = await operation(item, index);
		}
	});
	await Promise.all(workers);
	return results;
}

export async function runDiagnosisAgent(
	model: DiagnosisModelProvider,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const modelName = model.model ?? "configured model";
	const messages: ChatMessage[] = [
		{
			role: "user",
			content: JSON.stringify({
				task: "Diagnose this incident",
				incident: input.incident,
				repositories: input.repositories,
			}),
		},
	];
	let inputTokens = 0;
	let outputTokens = 0;
	let sequence = 0;
	const activity = async (value: Omit<AgentActivity, "sequence">) => {
		sequence += 1;
		await input.onActivity({ sequence, ...value });
	};
	await activity({
		kind: "system_prompt",
		summary: "Loaded the investigation system prompt",
		detail: AGENT_SYSTEM_PROMPT,
	});
	await activity({
		kind: "user_prompt",
		summary: "Submitted the redacted incident and pinned repository revisions",
		detail: messages[0]?.content ?? "",
	});
	await activity({
		kind: "analysis",
		summary: `Reviewing the incident and ${input.repositories.length} pinned repository revision${input.repositories.length === 1 ? "" : "s"}`,
	});
	for (let turn = 0; turn < 20; turn += 1) {
		if (input.signal?.aborted) throw input.signal.reason;
		await activity({
			kind: "reasoning",
			summary: `Planning investigation step ${turn + 1}`,
			detail: JSON.stringify({ model: modelName, reasoningEffort: "medium" }, null, 2),
		});
		const modelStarted = performance.now();
		const next = await model.continueAgent(messages, undefined, input.signal);
		const toolCalls = next.rawToolCalls.map((call) => ({
			...agentToolSchema.parse({ name: call.name, ...JSON.parse(call.arguments) }),
			callId: call.callId,
		}));
		const modelDurationMs = Math.round(performance.now() - modelStarted);
		inputTokens += next.usage.inputTokens;
		outputTokens += next.usage.outputTokens;
		messages.push(next.message);
		await activity({
			kind: "assistant_message",
			summary: toolCalls.length
				? `The model requested ${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"}`
				: "The model finished its investigation loop",
			detail: JSON.stringify(
				{ model: modelName, reasoningEffort: "medium", message: next.message },
				null,
				2,
			),
			durationMs: modelDurationMs,
		});
		if (!toolCalls.length) break;
		if (toolCalls.length > MAX_TOOL_CALLS_PER_TURN)
			throw new ModelToolCallLimitError(
				`The model requested ${toolCalls.length} tools; the maximum is ${MAX_TOOL_CALLS_PER_TURN}`,
			);
		if (toolCalls.filter(({ name }) => name === "run_check").length > 1)
			throw new ModelCheckCallLimitError("The model requested more than one repository check");
		const calls = toolCalls.map(({ callId, ...tool }, index) => ({ callId, tool, index }));
		const inspections = calls.filter(
			(call): call is typeof call & { tool: InspectionOperation } => call.tool.name !== "run_check",
		);
		const check = calls.find(({ tool }) => tool.name === "run_check");
		const batchCorrelationId = crypto.randomUUID();
		await activity({
			kind: "tool_batch_started",
			summary: `Running ${inspections.length} independent repository inspection${inspections.length === 1 ? "" : "s"}${check ? " and 1 repository check" : ""}`,
			correlationId: batchCorrelationId,
		});
		for (const { tool, callId } of calls)
			await activity({
				kind: "tool_started",
				summary: describeTool(tool),
				detail: JSON.stringify(tool, null, 2),
				toolName: tool.name,
				correlationId: callId,
			});
		const batchStarted = performance.now();
		const results = Array.from<ToolResult>({ length: calls.length });
		await mapWithConcurrency(
			inspections,
			MAX_PARALLEL_INSPECTIONS,
			async ({ tool, index, callId }) => {
				const result = await input.sandboxProvider.inspect(input.sandbox, tool);
				results[index] = result;
				await activity({
					kind: "tool_completed",
					summary: describeToolResult(tool, result),
					detail: JSON.stringify(result, null, 2),
					toolName: tool.name,
					durationMs: result.durationMs,
					correlationId: callId,
				});
				return result;
			},
		);
		if (check && check.tool.name === "run_check") {
			const result = await input.sandboxProvider.runCheck(input.sandbox, check.tool);
			results[check.index] = result;
			await activity({
				kind: "tool_completed",
				summary: describeToolResult(check.tool, result),
				detail: JSON.stringify(result, null, 2),
				toolName: check.tool.name,
				durationMs: result.durationMs,
				correlationId: check.callId,
			});
		}
		const batchDurationMs = Math.round(performance.now() - batchStarted);
		await activity({
			kind: "tool_batch_completed",
			summary: `Completed ${calls.length} tool${calls.length === 1 ? "" : "s"} in ${(batchDurationMs / 1_000).toFixed(1)}s`,
			durationMs: batchDurationMs,
			correlationId: batchCorrelationId,
		});
		messages.push(
			...calls.map(({ callId, index }) => ({
				role: "tool" as const,
				tool_call_id: callId,
				content: JSON.stringify(results[index]),
			})),
		);
	}

	await activity({
		kind: "final_system_prompt",
		summary: "Loaded the structured diagnosis system prompt",
		detail: FINAL_SYSTEM_PROMPT,
	});
	await activity({
		kind: "synthesis",
		summary: "Synthesizing a diagnosis from the gathered evidence",
		detail: JSON.stringify({ model: modelName, reasoningEffort: "medium" }, null, 2),
	});
	const invalidDiagnosis = async (errors: string[]): Promise<AgentRunResult> => {
		await activity({
			kind: "validation",
			summary: "The repaired diagnosis was still invalid; returning an inconclusive result",
			detail: errors.join("\n").slice(0, 16_000),
		});
		return {
			inputTokens,
			outputTokens,
			diagnosis: createInconclusiveDiagnosis(
				errors.some((error) => /invalid_(?:type|union)|unrecognized_keys/i.test(error))
					? "model_output_invalid"
					: "evidence_unverified",
			),
		};
	};
	const diagnosisStarted = performance.now();
	let final;
	let repairUsed = false;
	try {
		final = await model.createDiagnosis(messages, undefined, input.signal);
	} catch (error) {
		if (!(error instanceof ModelDiagnosisValidationError)) throw error;
		inputTokens += error.usage.inputTokens;
		outputTokens += error.usage.outputTokens;
		await activity({
			kind: "validation",
			summary: "The structured diagnosis was invalid; requesting one corrected diagnosis",
			detail: error.message,
			durationMs: Math.round(performance.now() - diagnosisStarted),
		});
		repairUsed = true;
		try {
			final = await model.createDiagnosis(messages, error.message, input.signal);
		} catch (repairError) {
			if (!(repairError instanceof ModelDiagnosisValidationError)) throw repairError;
			inputTokens += repairError.usage.inputTokens;
			outputTokens += repairError.usage.outputTokens;
			return invalidDiagnosis([repairError.message]);
		}
	}
	let diagnosisDurationMs = Math.round(performance.now() - diagnosisStarted);
	inputTokens += final.usage.inputTokens;
	outputTokens += final.usage.outputTokens;
	final = { ...final, diagnosis: await hydrateDiagnosisEvidence(final.diagnosis, input.snapshot) };
	await activity({
		kind: "diagnosis_response",
		summary: `The model returned a ${final.diagnosis.status} result`,
		detail: JSON.stringify(
			{ model: modelName, reasoningEffort: "medium", diagnosis: final.diagnosis },
			null,
			2,
		),
		durationMs: diagnosisDurationMs,
	});
	let errors = await validateDiagnosisEvidence(final.diagnosis, input.snapshot);
	if (errors.length > 0 && !repairUsed) {
		await activity({
			kind: "validation",
			summary: `Evidence validation found ${errors.length} issue${errors.length === 1 ? "" : "s"}; requesting one corrected diagnosis`,
			detail: errors.join("\n"),
		});
		const repairStarted = performance.now();
		try {
			final = await model.createDiagnosis(messages, errors.join("; "), input.signal);
		} catch (error) {
			if (!(error instanceof ModelDiagnosisValidationError)) throw error;
			inputTokens += error.usage.inputTokens;
			outputTokens += error.usage.outputTokens;
			return invalidDiagnosis([error.message]);
		}
		repairUsed = true;
		diagnosisDurationMs = Math.round(performance.now() - repairStarted);
		inputTokens += final.usage.inputTokens;
		outputTokens += final.usage.outputTokens;
		final = {
			...final,
			diagnosis: await hydrateDiagnosisEvidence(final.diagnosis, input.snapshot),
		};
		await activity({
			kind: "diagnosis_response",
			summary: `The model returned a repaired ${final.diagnosis.status} result`,
			detail: JSON.stringify(
				{ model: modelName, reasoningEffort: "medium", diagnosis: final.diagnosis },
				null,
				2,
			),
			durationMs: diagnosisDurationMs,
		});
		errors = await validateDiagnosisEvidence(final.diagnosis, input.snapshot);
	}
	if (errors.length > 0) {
		await activity({
			kind: "validation",
			summary: "Evidence validation still failed; returning an inconclusive result",
		});
		return invalidDiagnosis(errors);
	}
	await activity({
		kind: "completed",
		summary: "Diagnosis and all cited evidence passed validation",
	});
	return { diagnosis: final.diagnosis, inputTokens, outputTokens };
}
