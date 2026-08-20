import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { createDatabase, createRetryRun } from '@legwork/db';
import { loadIncident, loadIncidentRun } from '$lib/server/incidents';
import { requireTenant } from '$lib/server/tenant';
import { problemFail } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';

type RunRow = NonNullable<Awaited<ReturnType<typeof loadIncidentRun>>>['run'];

const projectRun = (run: RunRow) => ({
	id: run.id,
	status: run.status,
	attempt: run.attempt,
	retryOfRunId: run.retryOfRunId,
	failureCode: run.failureCode,
	inputTokens: run.inputTokens,
	outputTokens: run.outputTokens,
	createdAt: run.createdAt,
	completedAt: run.completedAt
});

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const tenant = await requireTenant(locals);
	const incident = await loadIncident(tenant.organizationId, params.incidentId);
	if (!incident) error(404, 'Not found');
	// A historical run is rendered statically; the live view always follows the
	// current (newest) run through the SSE stream.
	const requestedRunId = url.searchParams.get('run');
	const selected =
		requestedRunId && requestedRunId !== incident.currentRun?.id
			? await loadIncidentRun(tenant.organizationId, params.incidentId, requestedRunId)
			: null;
	return {
		title: incident.incident.title,
		// Same five-field shape the SSE endpoint at /api/incidents/[incidentId]/events sends.
		snapshot: {
			incident: incident.incident,
			serviceName: incident.serviceName,
			currentRun: incident.currentRun,
			steps: incident.steps,
			diagnosis: incident.diagnosis
		},
		runs: incident.runs.map(projectRun),
		callbacks: incident.callbacks.map((delivery) => ({
			id: delivery.id,
			event: delivery.event,
			status: delivery.status,
			attempt: delivery.attempt,
			responseStatus: delivery.responseStatus,
			error: delivery.error,
			nextAttemptAt: delivery.nextAttemptAt,
			deliveredAt: delivery.deliveredAt,
			createdAt: delivery.createdAt
		})),
		selectedRun: selected
			? { run: projectRun(selected.run), steps: selected.steps, diagnosis: selected.diagnosis }
			: null
	};
};

export const actions: Actions = {
	retry: async ({ locals, params, request }) => {
		try {
			const tenant = await requireTenant(locals);
			const form = await request.formData();
			const runId = z.uuid().parse(form.get('runId'));
			const run = await createRetryRun(
				createDatabase(),
				tenant.organizationId,
				params.incidentId,
				runId
			);
			return { runId: run.id, status: 'queued' };
		} catch (error) {
			return problemFail(error);
		}
	}
};
