import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { incidentResultResponseSchema } from '@legwork/contracts';
import { HttpProblem, problemResponse } from '$lib/server/http';
import { loadServiceIncidentResult } from '$lib/server/incidents';
import { authenticateServiceRequest } from '$lib/server/service-auth';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async (event) => {
	try {
		const service = await authenticateServiceRequest(event.request, event.params.serviceSlug);
		const { incidentId } = event.params;
		const result = UUID.test(incidentId)
			? await loadServiceIncidentResult(service.organizationId, service.id, incidentId)
			: null;
		if (!result)
			throw new HttpProblem(404, 'Not Found', 'No incident with this id for this service');
		const { incident, currentRun, diagnosis } = result;
		const appUrl = env.APP_URL ?? event.url.origin;
		return json(
			incidentResultResponseSchema.parse({
				incidentId: incident.id,
				externalId: incident.externalId,
				title: incident.title,
				severity: incident.severity,
				runId: currentRun?.id ?? null,
				status: currentRun?.status ?? null,
				failure:
					currentRun && (currentRun.failureCode || currentRun.failureMessage)
						? { code: currentRun.failureCode, message: currentRun.failureMessage }
						: null,
				diagnosis,
				dashboardUrl: `${appUrl}/incidents/${incident.id}`,
				createdAt: incident.createdAt.toISOString(),
				completedAt: currentRun?.completedAt?.toISOString() ?? null
			}),
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return problemResponse(error);
	}
};
