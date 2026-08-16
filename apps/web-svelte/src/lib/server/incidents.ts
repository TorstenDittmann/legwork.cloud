import { and, asc, desc, eq } from 'drizzle-orm';
import {
	agentSteps,
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	incidents,
	services
} from '@oncall-ai/db';

export async function loadIncident(organizationId: string, incidentId: string) {
	const db = createDatabase();
	const [incident] = await db
		.select({ incident: incidents, serviceName: services.name })
		.from(incidents)
		.innerJoin(
			services,
			and(eq(services.id, incidents.serviceId), eq(services.organizationId, organizationId))
		)
		.where(and(eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId)))
		.limit(1);
	if (!incident) return null;
	const runs = await db
		.select()
		.from(analysisRuns)
		.where(
			and(eq(analysisRuns.incidentId, incidentId), eq(analysisRuns.organizationId, organizationId))
		)
		.orderBy(desc(analysisRuns.createdAt));
	const current = runs[0];
	const [steps, diagnosis, callbacks] = current
		? await Promise.all([
				db
					.select()
					.from(agentSteps)
					.where(
						and(eq(agentSteps.runId, current.id), eq(agentSteps.organizationId, organizationId))
					)
					.orderBy(asc(agentSteps.sequence)),
				db
					.select()
					.from(diagnoses)
					.where(and(eq(diagnoses.runId, current.id), eq(diagnoses.organizationId, organizationId)))
					.limit(1),
				db
					.select()
					.from(callbackDeliveries)
					.where(
						and(
							eq(callbackDeliveries.runId, current.id),
							eq(callbackDeliveries.organizationId, organizationId)
						)
					)
					.orderBy(desc(callbackDeliveries.createdAt))
			])
		: [[], [], []];
	return {
		...incident,
		runs,
		currentRun: current ?? null,
		steps,
		diagnosis: diagnosis[0]?.diagnosis ?? null,
		callbacks
	};
}
