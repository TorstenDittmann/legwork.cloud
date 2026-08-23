import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { analysisRuns, createDatabase, incidents, services } from '@legwork/db';
import { loadSetupProgress } from '$lib/server/setup';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const db = createDatabase();
	const month = new Date();
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	const [[serviceCount], [incidentCount], [activeCount], recent, setup] = await Promise.all([
		db
			.select({ value: count() })
			.from(services)
			.where(eq(services.organizationId, tenant.organizationId)),
		db
			.select({ value: count() })
			.from(incidents)
			.where(
				and(eq(incidents.organizationId, tenant.organizationId), gte(incidents.createdAt, month))
			),
		db
			.select({ value: count() })
			.from(analysisRuns)
			.where(
				and(
					eq(analysisRuns.organizationId, tenant.organizationId),
					inArray(analysisRuns.status, ['queued', 'provisioning', 'analyzing'])
				)
			),
		db
			.select({ incident: incidents, serviceName: services.name })
			.from(incidents)
			.innerJoin(
				services,
				and(
					eq(services.id, incidents.serviceId),
					eq(services.organizationId, tenant.organizationId)
				)
			)
			.where(eq(incidents.organizationId, tenant.organizationId))
			.orderBy(desc(incidents.occurredAt))
			.limit(6),
		loadSetupProgress(tenant.organizationId)
	]);
	const recentRuns = recent.length
		? await db
				.select()
				.from(analysisRuns)
				.where(
					and(
						eq(analysisRuns.organizationId, tenant.organizationId),
						inArray(
							analysisRuns.incidentId,
							recent.map(({ incident }) => incident.id)
						)
					)
				)
				.orderBy(desc(analysisRuns.createdAt))
		: [];
	// Runs are ordered by createdAt desc, so the first run seen per incident wins.
	const runByIncident = new Map<string, (typeof recentRuns)[number]>();
	for (const run of recentRuns)
		if (!runByIncident.has(run.incidentId)) runByIncident.set(run.incidentId, run);
	return {
		title: 'Dashboard',
		role: tenant.role,
		setup,
		month,
		serviceCount: serviceCount?.value ?? 0,
		incidentCount: incidentCount?.value ?? 0,
		activeCount: activeCount?.value ?? 0,
		recent: recent.map(({ incident, serviceName }) => ({
			id: incident.id,
			title: incident.title,
			severity: incident.severity,
			occurredAt: incident.occurredAt,
			serviceName,
			runStatus: runByIncident.get(incident.id)?.status ?? 'queued'
		}))
	};
};
