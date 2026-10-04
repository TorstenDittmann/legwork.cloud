import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import {
	agentSteps,
	analysisRuns,
	LibSqlCheckpointSaver,
	createDatabase,
	organizations,
} from "@legwork/db";
import { analysisDuration, logger } from "@legwork/observability";
import { createSandboxProvider } from "@legwork/sandbox";
import { runIncidentAnalysisGraph } from "./analysis-graph";

export interface AnalyzeDependencies {
	githubAppId: string;
	githubPrivateKey: string;
	openRouterApiKey: string;
	model: string;
	commandExecutionEnabled: boolean;
	capabilityProbePassed: boolean;
	encryptionKey: string;
}

const terminalStatuses = ["completed", "inconclusive", "failed", "cancelled"] as const;
export class OrganizationConcurrencyDeferredError extends Error {}

function safeFailure(error: unknown): { code: string; message: string } {
	const raw = error instanceof Error ? error.message : "Analysis failed";
	const code =
		error && typeof error === "object" && "code" in error
			? String(error.code)
			: /^[A-Z][A-Z0-9_]+$/.test(raw)
				? raw
				: raw === "The operation timed out" || raw === "ANALYSIS_TIMEOUT"
					? "ANALYSIS_TIMEOUT"
					: "ANALYSIS_FAILED";
	return { code, message: raw.slice(0, 2_000) };
}

export async function analyzeIncident(
	runId: string,
	dependencies: AnalyzeDependencies,
): Promise<void> {
	const db = createDatabase();
	const started = Date.now();
	const [run] = await db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).limit(1);
	if (
		!run ||
		(terminalStatuses.includes(run.status as (typeof terminalStatuses)[number]) && !run.sandboxId)
	)
		return;

	await db.transaction(
		async (tx) => {
			const [organization] = await tx
				.select()
				.from(organizations)
				.where(eq(organizations.id, run.organizationId))
				.limit(1);
			if (!organization) throw new Error("Organization no longer exists");
			const [active] = await tx
				.select({ value: count() })
				.from(analysisRuns)
				.where(
					and(
						eq(analysisRuns.organizationId, organization.id),
						ne(analysisRuns.id, runId),
						inArray(analysisRuns.status, ["provisioning", "analyzing"]),
					),
				);
			if ((active?.value ?? 0) >= organization.maxConcurrentRuns)
				throw new OrganizationConcurrencyDeferredError("ORGANIZATION_CONCURRENCY_LIMIT");
			await tx
				.update(analysisRuns)
				.set({
					status: "provisioning",
					attempt: sql`${analysisRuns.attempt} + 1`,
					startedAt: run.startedAt ?? new Date(),
					completedAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(eq(analysisRuns.id, runId), eq(analysisRuns.organizationId, run.organizationId)),
				);
		},
		{ behavior: "immediate" },
	);

	const [latest] = await db
		.select({ sequence: sql<number>`coalesce(max(${agentSteps.sequence}), 0)`.mapWith(Number) })
		.from(agentSteps)
		.where(and(eq(agentSteps.organizationId, run.organizationId), eq(agentSteps.runId, runId)));
	let activitySequence = latest?.sequence ?? 0;
	let activityWrites = Promise.resolve();
	const recordActivity = (activity: {
		kind: string;
		summary: string;
		detail?: string;
		toolName?: string;
		durationMs?: number;
		correlationId?: string;
	}) => {
		activitySequence += 1;
		const sequence = activitySequence;
		activityWrites = activityWrites.then(async () => {
			logger.info(
				{
					runId,
					organizationId: run.organizationId,
					sequence,
					kind: activity.kind,
					toolName: activity.toolName,
					durationMs: activity.durationMs,
				},
				"analysis activity",
			);
			await db.insert(agentSteps).values({
				organizationId: run.organizationId,
				runId,
				sequence,
				kind: activity.kind,
				summary: activity.summary,
				detail: activity.detail,
				toolName: activity.toolName,
				durationMs: activity.durationMs,
				correlationId: activity.correlationId,
				expiresAt: run.expiresAt,
			});
		});
		return activityWrites;
	};

	const checkpointer = new LibSqlCheckpointSaver({
		db,
		organizationId: run.organizationId,
		runId,
		expiresAt: run.expiresAt,
	});
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error("ANALYSIS_TIMEOUT")), 10 * 60_000);
	logger.info({ runId, organizationId: run.organizationId }, "analysis graph started");
	try {
		const result = await runIncidentAnalysisGraph(
			{ runId, organizationId: run.organizationId },
			{
				db,
				githubAppId: dependencies.githubAppId,
				githubPrivateKey: dependencies.githubPrivateKey,
				openRouterApiKey: dependencies.openRouterApiKey,
				model: dependencies.model,
				commandExecutionEnabled: dependencies.commandExecutionEnabled,
				capabilityProbePassed: dependencies.capabilityProbePassed,
				encryptionKey: dependencies.encryptionKey,
				expiresAt: run.expiresAt,
				signal: controller.signal,
				recordActivity,
			},
			checkpointer,
		);
		logger.info(
			{
				runId,
				organizationId: run.organizationId,
				status: result.diagnosis.status,
				inputTokens: result.inputTokens,
				outputTokens: result.outputTokens,
				durationMs: Date.now() - started,
			},
			"analysis graph completed",
		);
		analysisDuration.observe(
			{ status: result.diagnosis.status === "diagnosed" ? "completed" : "inconclusive" },
			(Date.now() - started) / 1_000,
		);
	} catch (error) {
		const failure = safeFailure(error);
		await recordActivity({
			kind: "analysis_failed",
			summary: "Analysis graph paused after a failure",
			detail: JSON.stringify(failure),
		});
		const [current] = await db
			.select({ sandboxId: analysisRuns.sandboxId, startedAt: analysisRuns.startedAt })
			.from(analysisRuns)
			.where(and(eq(analysisRuns.id, runId), eq(analysisRuns.organizationId, run.organizationId)))
			.limit(1);
		if (current?.sandboxId) {
			const provider = createSandboxProvider({
				commandExecutionEnabled: dependencies.commandExecutionEnabled,
				capabilityProbePassed: dependencies.capabilityProbePassed,
			});
			await provider
				.destroy({ id: current.sandboxId, createdAt: current.startedAt ?? run.createdAt })
				.catch(() => undefined);
		}
		await db
			.update(analysisRuns)
			.set({
				status: "failed",
				sandboxId: null,
				failureCode: failure.code,
				failureMessage: failure.message,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(and(eq(analysisRuns.id, runId), eq(analysisRuns.organizationId, run.organizationId)));
		logger.error(
			{ runId, organizationId: run.organizationId, err: error },
			"analysis graph failed",
		);
		analysisDuration.observe({ status: "failed" }, (Date.now() - started) / 1_000);
		throw error;
	} finally {
		clearTimeout(timeout);
		await activityWrites;
	}
}
