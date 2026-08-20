import { and, asc, desc, eq } from 'drizzle-orm';
import {
	agentSteps,
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	incidents,
	services
} from '@legwork/db';

/**
 * The subset of loadIncident() the live SSE stream serializes. Polled every
 * 500ms per open incident tab, so it skips the full run history and callback
 * deliveries that loadIncident() fetches for the page shell.
 */
export async function loadIncidentStream(organizationId: string, incidentId: string) {
	const db = createDatabase();
	const [[incident], [currentRun]] = await Promise.all([
		db
			.select({ incident: incidents, serviceName: services.name })
			.from(incidents)
			.innerJoin(
				services,
				and(eq(services.id, incidents.serviceId), eq(services.organizationId, organizationId))
			)
			.where(and(eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId)))
			.limit(1),
		db
			.select()
			.from(analysisRuns)
			.where(
				and(
					eq(analysisRuns.incidentId, incidentId),
					eq(analysisRuns.organizationId, organizationId)
				)
			)
			.orderBy(desc(analysisRuns.createdAt))
			.limit(1)
	]);
	if (!incident) return null;
	const [steps, diagnosis] = currentRun
		? await Promise.all([
				db
					.select()
					.from(agentSteps)
					.where(
						and(eq(agentSteps.runId, currentRun.id), eq(agentSteps.organizationId, organizationId))
					)
					.orderBy(asc(agentSteps.sequence)),
				db
					.select()
					.from(diagnoses)
					.where(
						and(eq(diagnoses.runId, currentRun.id), eq(diagnoses.organizationId, organizationId))
					)
					.limit(1)
			])
		: [[], []];
	return {
		incident: incident.incident,
		serviceName: incident.serviceName,
		currentRun: currentRun ?? null,
		steps,
		diagnosis: diagnosis[0]?.diagnosis ?? null
	};
}

/**
 * A single historical run with its own steps and diagnosis, for viewing prior
 * attempts after a retry replaced the live view. Scoped to the incident so a
 * run id from another incident (or tenant) resolves to null.
 */
export async function loadIncidentRun(organizationId: string, incidentId: string, runId: string) {
	const db = createDatabase();
	const [run] = await db
		.select()
		.from(analysisRuns)
		.where(
			and(
				eq(analysisRuns.id, runId),
				eq(analysisRuns.incidentId, incidentId),
				eq(analysisRuns.organizationId, organizationId)
			)
		)
		.limit(1);
	if (!run) return null;
	const [steps, diagnosis] = await Promise.all([
		db
			.select()
			.from(agentSteps)
			.where(and(eq(agentSteps.runId, run.id), eq(agentSteps.organizationId, organizationId)))
			.orderBy(asc(agentSteps.sequence)),
		db
			.select()
			.from(diagnoses)
			.where(and(eq(diagnoses.runId, run.id), eq(diagnoses.organizationId, organizationId)))
			.limit(1)
	]);
	return { run, steps, diagnosis: diagnosis[0]?.diagnosis ?? null };
}

export async function loadIncident(organizationId: string, incidentId: string) {
	const db = createDatabase();
	const [[incident], runs] = await Promise.all([
		db
			.select({ incident: incidents, serviceName: services.name })
			.from(incidents)
			.innerJoin(
				services,
				and(eq(services.id, incidents.serviceId), eq(services.organizationId, organizationId))
			)
			.where(and(eq(incidents.id, incidentId), eq(incidents.organizationId, organizationId)))
			.limit(1),
		db
			.select()
			.from(analysisRuns)
			.where(
				and(
					eq(analysisRuns.incidentId, incidentId),
					eq(analysisRuns.organizationId, organizationId)
				)
			)
			.orderBy(desc(analysisRuns.createdAt))
	]);
	if (!incident) return null;
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
