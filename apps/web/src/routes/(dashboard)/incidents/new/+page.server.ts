import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createIncidentRequestSchema } from '@legwork/contracts';
import { createDatabase, createIncidentIdempotently, services } from '@legwork/db';
import { redactSecrets } from '@legwork/security';
import { HttpProblem, problemFail } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const rows = await createDatabase()
		.select({ id: services.id, name: services.name })
		.from(services)
		.where(and(eq(services.organizationId, tenant.organizationId), eq(services.enabled, true)));
	return { title: 'Submit an Incident', services: rows };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		let incidentId: string;
		try {
			const tenant = await requireTenant(locals);
			const form = await request.formData();
			if (!form.has('serviceId'))
				throw new HttpProblem(422, 'Validation Failed', 'serviceId is required');
			const serviceId = String(form.get('serviceId'));
			// The client submits datetime-local values converted to ISO via
			// enhance; keep invalid values as-is so schema validation reports them.
			const occurredAtRaw = String(form.get('occurredAt') ?? '');
			const occurredAtDate = new Date(occurredAtRaw);
			const incidentRaw = {
				externalId: form.get('externalId'),
				title: form.get('title'),
				description: form.get('description') || undefined,
				severity: form.get('severity'),
				occurredAt: Number.isNaN(occurredAtDate.getTime())
					? occurredAtRaw
					: occurredAtDate.toISOString(),
				environment: form.get('environment') || undefined,
				stackTrace: form.get('stackTrace') || undefined
			};
			const parsed = createIncidentRequestSchema.parse(incidentRaw);
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
				payload: redactSecrets(parsed)
			});
			incidentId = result.incidentId;
		} catch (error) {
			return problemFail(error);
		}
		redirect(303, `/incidents/${incidentId}`);
	}
};
