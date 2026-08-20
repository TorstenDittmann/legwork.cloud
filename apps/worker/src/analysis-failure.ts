import { and, eq, notInArray } from "drizzle-orm";
import { analysisRuns, reconcileUsage, type Database } from "@legwork/db";
import { logger } from "@legwork/observability";
import { enqueueAutomaticCallback } from "./callbacks";
import { enqueueNotifications } from "./notifications";

/**
 * Statuses that mean the run already reached a settled result. A failure in a
 * post-analysis step (callback/notification enqueue) must never claw these
 * back: resetting a settled run re-enters the graph on a thread that is
 * already at END, which strands the run in "provisioning" with its diagnosis
 * invisible.
 */
const settledStatuses = ["completed", "inconclusive", "cancelled"] as const;

export async function handleAnalysisFailure(
	db: Database,
	runId: string,
	retry: boolean,
): Promise<void> {
	if (retry) {
		const reset = await db
			.update(analysisRuns)
			.set({
				status: "queued",
				failureCode: null,
				failureMessage: null,
				completedAt: null,
				updatedAt: new Date(),
			})
			.where(and(eq(analysisRuns.id, runId), notInArray(analysisRuns.status, [...settledStatuses])))
			.returning({ id: analysisRuns.id });
		if (reset.length === 0)
			logger.info(
				{ runId },
				"analysis job will retry its post-analysis steps without resetting the settled run",
			);
		return;
	}
	const [run] = await db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).limit(1);
	if (run) {
		const settled = (settledStatuses as readonly string[]).includes(run.status);
		if (!settled) {
			if (run.status !== "failed")
				await db
					.update(analysisRuns)
					.set({
						status: "failed",
						failureCode: "JOB_ATTEMPTS_EXHAUSTED",
						failureMessage: "Analysis could not complete after automatic retries",
						completedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(
						and(eq(analysisRuns.id, runId), notInArray(analysisRuns.status, [...settledStatuses])),
					);
			// Release the quota reservation for the failed run. Settled runs
			// already reconciled their real token usage in persist_result and
			// must not have it zeroed here.
			await reconcileUsage(db, run.organizationId, runId, 0, 0);
		}
	}
	await enqueueAutomaticCallback(db, runId);
	await enqueueNotifications(runId);
}
