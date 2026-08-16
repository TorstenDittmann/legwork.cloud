import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { createDatabase, createRetryRun } from '@oncall-ai/db';
import { loadIncident } from '$lib/server/incidents';
import { requireTenant } from '$lib/server/tenant';
import { problemFail } from '$lib/server/http';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const tenant = await requireTenant(locals);
	const incident = await loadIncident(tenant.organizationId, params.incidentId);
	if (!incident) error(404, 'Not found');
	return {
		title: 'Incident',
		// Same five-field shape the SSE endpoint at /api/incidents/[incidentId]/events sends.
		snapshot: {
			incident: incident.incident,
			serviceName: incident.serviceName,
			currentRun: incident.currentRun,
			steps: incident.steps,
			diagnosis: incident.diagnosis
		}
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
