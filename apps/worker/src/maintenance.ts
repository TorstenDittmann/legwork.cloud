import { and, eq, inArray, lt, or } from "drizzle-orm";
import {
	agentSteps,
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	diagnosisFeedback,
	incidents,
	langgraphCheckpoints,
	langgraphCheckpointWrites,
	notificationDeliveries,
	integrationDeliveries,
	externalIncidentLinks,
	purgeFinishedJobs,
	serviceRateLimits,
} from "@legwork/db";
import { destroyedSandboxes, logger, purgedRecords } from "@legwork/observability";
import { createSandboxProvider } from "@legwork/sandbox";

/** How long completed/failed durable job rows are kept for operator inspection. */
const FINISHED_JOB_HISTORY_MS = 7 * 24 * 60 * 60_000;
/** Rate-limit windows are minute-sized; anything older than a day is dead weight. */
const RATE_LIMIT_HISTORY_MS = 24 * 60 * 60_000;

export async function purgeExpired(now = new Date()): Promise<void> {
	const db = createDatabase();
	// LangGraph checkpoints serialize the full analysis message history
	// (redacted incident payload, file excerpts, model output); leaving them
	// behind would outlive the retention window of everything else on the run.
	const deletedCheckpointWrites = await db
		.delete(langgraphCheckpointWrites)
		.where(lt(langgraphCheckpointWrites.expiresAt, now))
		.returning({ threadId: langgraphCheckpointWrites.threadId });
	const deletedCheckpoints = await db
		.delete(langgraphCheckpoints)
		.where(lt(langgraphCheckpoints.expiresAt, now))
		.returning({ threadId: langgraphCheckpoints.threadId });
	const deletedJobs = await purgeFinishedJobs(
		db,
		new Date(now.getTime() - FINISHED_JOB_HISTORY_MS),
	);
	const deletedRateLimits = await db
		.delete(serviceRateLimits)
		.where(lt(serviceRateLimits.windowStartedAt, new Date(now.getTime() - RATE_LIMIT_HISTORY_MS)))
		.returning({ serviceId: serviceRateLimits.serviceId });
	purgedRecords.inc({ table: "langgraph_checkpoint_writes" }, deletedCheckpointWrites.length);
	purgedRecords.inc({ table: "langgraph_checkpoints" }, deletedCheckpoints.length);
	purgedRecords.inc({ table: "durable_jobs" }, deletedJobs);
	purgedRecords.inc({ table: "service_rate_limits" }, deletedRateLimits.length);
	const deletedCallbacks = await db
		.delete(callbackDeliveries)
		.where(lt(callbackDeliveries.expiresAt, now))
		.returning({ id: callbackDeliveries.id });
	const deletedDeliveries = await db
		.delete(integrationDeliveries)
		.where(lt(integrationDeliveries.expiresAt, now))
		.returning({ id: integrationDeliveries.id });
	const deletedNotifications = await db
		.delete(notificationDeliveries)
		.where(lt(notificationDeliveries.expiresAt, now))
		.returning({ id: notificationDeliveries.id });
	const deletedLinks = await db
		.delete(externalIncidentLinks)
		.where(lt(externalIncidentLinks.expiresAt, now))
		.returning({ id: externalIncidentLinks.id });
	const deletedDiagnoses = await db
		.delete(diagnoses)
		.where(lt(diagnoses.expiresAt, now))
		.returning({ id: diagnoses.id });
	const deletedFeedback = await db
		.delete(diagnosisFeedback)
		.where(lt(diagnosisFeedback.expiresAt, now))
		.returning({ id: diagnosisFeedback.id });
	const deletedSteps = await db
		.delete(agentSteps)
		.where(lt(agentSteps.expiresAt, now))
		.returning({ id: agentSteps.id });
	purgedRecords.inc({ table: "callback_deliveries" }, deletedCallbacks.length);
	purgedRecords.inc({ table: "integration_deliveries" }, deletedDeliveries.length);
	purgedRecords.inc({ table: "notification_deliveries" }, deletedNotifications.length);
	purgedRecords.inc({ table: "external_incident_links" }, deletedLinks.length);
	purgedRecords.inc({ table: "diagnoses" }, deletedDiagnoses.length);
	purgedRecords.inc({ table: "diagnosis_feedback" }, deletedFeedback.length);
	purgedRecords.inc({ table: "agent_steps" }, deletedSteps.length);
	const deletedIncidents = await db
		.delete(incidents)
		.where(lt(incidents.expiresAt, now))
		.returning({ id: incidents.id });
	purgedRecords.inc({ table: "incidents" }, deletedIncidents.length);
}

export async function destroyOrphanedSandboxes(now = new Date()): Promise<void> {
	const db = createDatabase();
	const provider = createSandboxProvider({
		commandExecutionEnabled: false,
		capabilityProbePassed: false,
	});
	const candidates = await db
		.select({ runId: analysisRuns.id, sandboxId: analysisRuns.sandboxId })
		.from(analysisRuns)
		.where(
			and(
				or(
					inArray(analysisRuns.status, ["completed", "inconclusive", "failed", "cancelled"]),
					lt(analysisRuns.expiresAt, now),
				),
			),
		);
	for (const candidate of candidates) {
		if (!candidate.sandboxId) continue;
		try {
			await provider.destroy({ id: candidate.sandboxId, createdAt: now });
			await db
				.update(analysisRuns)
				.set({ sandboxId: null, updatedAt: new Date() })
				.where(eq(analysisRuns.id, candidate.runId));
			destroyedSandboxes.inc({ reason: "janitor" });
		} catch (error) {
			logger.warn(
				{ runId: candidate.runId, sandboxId: candidate.sandboxId, err: error },
				"orphan cleanup attempt failed",
			);
		}
	}
}
