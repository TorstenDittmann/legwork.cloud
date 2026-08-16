import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createIncidentRequestSchema, MAX_IDEMPOTENCY_KEY_LENGTH } from '@oncall-ai/contracts';
import {
	consumeServiceRateLimit,
	createDatabase,
	createIncidentIdempotently,
	QuotaExceededError
} from '@oncall-ai/db';
import { redactSecrets } from '@oncall-ai/security';
import { HttpProblem, problemResponse, readLimitedJson } from '$lib/server/http';
import { authenticateServiceRequest } from '$lib/server/service-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		const request = event.request;
		const { serviceSlug } = event.params;
		const service = await authenticateServiceRequest(request, serviceSlug);
		const idempotencyKey = request.headers.get('idempotency-key')?.trim();
		if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)
			throw new HttpProblem(
				400,
				'Invalid Idempotency Key',
				'Idempotency-Key is required and limited to 128 characters'
			);
		if (!(await consumeServiceRateLimit(createDatabase(), service.organizationId, service.id)))
			throw new HttpProblem(
				429,
				'Rate Limit Exceeded',
				'This service is limited to 60 incident requests per minute'
			);
		const parsed = createIncidentRequestSchema.safeParse(await readLimitedJson(request));
		if (!parsed.success)
			throw new HttpProblem(
				422,
				'Validation Failed',
				'Incident payload is invalid',
				parsed.error.flatten().fieldErrors as Record<string, string[]>
			);
		const result = await createIncidentIdempotently(createDatabase(), {
			organizationId: service.organizationId,
			serviceId: service.id,
			idempotencyKey,
			payload: redactSecrets(parsed.data)
		});
		const appUrl = env.APP_URL ?? event.url.origin;
		return json(
			{
				incidentId: result.incidentId,
				runId: result.runId,
				status: 'queued',
				dashboardUrl: `${appUrl}/incidents/${result.incidentId}`
			},
			{ status: 202 }
		);
	} catch (error) {
		if (error instanceof QuotaExceededError)
			return problemResponse(new HttpProblem(429, 'Quota Exceeded', error.message));
		return problemResponse(error);
	}
};
