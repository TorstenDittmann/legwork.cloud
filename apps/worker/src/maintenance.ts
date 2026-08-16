import { and, eq, inArray, lt, or } from "drizzle-orm";
import { Sandbox } from "railway";
import {
	agentSteps,
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	incidents,
	notificationDeliveries,
	integrationDeliveries,
	externalIncidentLinks,
} from "@legwork/db";
import { destroyedSandboxes, logger, purgedRecords } from "@legwork/observability";

export async function purgeExpired(now = new Date()): Promise<void> {
	const db = createDatabase();
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
	const deletedSteps = await db
		.delete(agentSteps)
		.where(lt(agentSteps.expiresAt, now))
		.returning({ id: agentSteps.id });
	purgedRecords.inc({ table: "callback_deliveries" }, deletedCallbacks.length);
	purgedRecords.inc({ table: "integration_deliveries" }, deletedDeliveries.length);
	purgedRecords.inc({ table: "notification_deliveries" }, deletedNotifications.length);
	purgedRecords.inc({ table: "external_incident_links" }, deletedLinks.length);
	purgedRecords.inc({ table: "diagnoses" }, deletedDiagnoses.length);
	purgedRecords.inc({ table: "agent_steps" }, deletedSteps.length);
	const deletedIncidents = await db
		.delete(incidents)
		.where(lt(incidents.expiresAt, now))
		.returning({ id: incidents.id });
	purgedRecords.inc({ table: "incidents" }, deletedIncidents.length);
}

export async function destroyOrphanedSandboxes(now = new Date()): Promise<void> {
	const db = createDatabase();
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
			const sandbox = await Sandbox.connect(candidate.sandboxId);
			await sandbox.destroy();
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
