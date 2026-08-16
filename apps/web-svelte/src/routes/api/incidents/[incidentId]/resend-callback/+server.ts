import { json } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	incidents,
	services
} from '@oncall-ai/db';
import { HttpProblem, problemResponse } from '$lib/server/http';
import { enqueueCallback } from '$lib/server/queue';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals, 'admin');
		const { incidentId } = event.params;
		const db = createDatabase();
		const [record] = await db
			.select({ run: analysisRuns, service: services })
			.from(analysisRuns)
			.innerJoin(
				incidents,
				and(
					eq(incidents.id, analysisRuns.incidentId),
					eq(incidents.organizationId, tenant.organizationId)
				)
			)
			.innerJoin(
				services,
				and(
					eq(services.id, incidents.serviceId),
					eq(services.organizationId, tenant.organizationId)
				)
			)
			.where(
				and(
					eq(analysisRuns.incidentId, incidentId),
					eq(analysisRuns.organizationId, tenant.organizationId),
					inArray(analysisRuns.status, ['completed', 'inconclusive', 'failed'])
				)
			)
			.orderBy(desc(analysisRuns.createdAt))
			.limit(1);
		if (!record?.service.callbackUrl)
			throw new HttpProblem(
				422,
				'Callback Unavailable',
				'No callback is configured for this service'
			);
		const [delivery] = await db
			.insert(callbackDeliveries)
			.values({
				organizationId: tenant.organizationId,
				runId: record.run.id,
				event:
					record.run.status === 'completed'
						? 'analysis.completed'
						: record.run.status === 'inconclusive'
							? 'analysis.inconclusive'
							: 'analysis.failed',
				expiresAt: record.run.expiresAt
			})
			.returning({ id: callbackDeliveries.id });
		if (!delivery) throw new Error('Failed to create delivery');
		await enqueueCallback(delivery.id);
		return json({ deliveryId: delivery.id, status: 'pending' }, { status: 202 });
	} catch (error) {
		return problemResponse(error);
	}
};
