import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createIncidentRequestSchema } from '@oncall-ai/contracts';
import { createDatabase, createIncidentIdempotently, services } from '@oncall-ai/db';
import { redactSecrets } from '@oncall-ai/security';
import { HttpProblem, problemResponse, readLimitedJson } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals);
		const raw = await readLimitedJson(event.request);
		if (!raw || typeof raw !== 'object' || !('serviceId' in raw))
			throw new HttpProblem(422, 'Validation Failed', 'serviceId is required');
		const serviceId = String(raw.serviceId);
		const incidentRaw = { ...raw } as Record<string, unknown>;
		delete incidentRaw.serviceId;
		const parsed = createIncidentRequestSchema.safeParse(incidentRaw);
		if (!parsed.success)
			throw new HttpProblem(
				422,
				'Validation Failed',
				'Incident payload is invalid',
				parsed.error.flatten().fieldErrors as Record<string, string[]>
			);
		const db = createDatabase();
		const [service] = await db
			.select()
			.from(services)
			.where(
				and(
					eq(services.id, serviceId),
					eq(services.organizationId, tenant.organizationId),
					eq(services.enabled, true)
				)
			)
			.limit(1);
		if (!service) throw new HttpProblem(404, 'Not Found', 'Service not found');
		const result = await createIncidentIdempotently(db, {
			organizationId: tenant.organizationId,
			serviceId,
			idempotencyKey: `manual:${crypto.randomUUID()}`,
			payload: redactSecrets(parsed.data)
		});
		return json(
			{ incidentId: result.incidentId, runId: result.runId, status: 'queued' },
			{ status: 202 }
		);
	} catch (error) {
		return problemResponse(error);
	}
};
