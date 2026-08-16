import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { analysisRuns, createDatabase, incidents, services } from '@oncall-ai/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const tenant = await requireTenant(locals);
	const param = (name: string) => {
		const values = url.searchParams.getAll(name);
		return values.length === 1 ? values[0] : null;
	};
	const filters = {
		status: param('status'),
		severity: param('severity'),
		service: param('service'),
		from: param('from'),
		to: param('to')
	};
	const db = createDatabase();
	const conditions = [eq(incidents.organizationId, tenant.organizationId)];
	if (
		filters.severity !== null &&
		['critical', 'high', 'medium', 'low', 'unknown'].includes(filters.severity)
	)
		conditions.push(eq(incidents.severity, filters.severity as 'critical'));
	if (filters.service !== null) conditions.push(eq(incidents.serviceId, filters.service));
	if (filters.from !== null) conditions.push(gte(incidents.occurredAt, new Date(filters.from)));
	if (filters.to !== null)
		conditions.push(lte(incidents.occurredAt, new Date(`${filters.to}T23:59:59.999Z`)));
	const [rows, serviceRows] = await Promise.all([
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
			.where(and(...conditions))
			.orderBy(desc(incidents.occurredAt))
			.limit(100),
		db
			.select({ id: services.id, name: services.name })
			.from(services)
			.where(eq(services.organizationId, tenant.organizationId))
	]);
	const runs = rows.length
		? await db
				.select()
				.from(analysisRuns)
				.where(
					and(
						eq(analysisRuns.organizationId, tenant.organizationId),
						inArray(
							analysisRuns.incidentId,
							rows.map((row) => row.incident.id)
						)
					)
				)
				.orderBy(desc(analysisRuns.createdAt))
		: [];
	// Runs are ordered by createdAt desc, so the first run seen per incident wins.
	const runByIncident = new Map<string, (typeof runs)[number]>();
	for (const run of runs)
		if (!runByIncident.has(run.incidentId)) runByIncident.set(run.incidentId, run);
	const displayed = rows
		.map((row) => ({ ...row, run: runByIncident.get(row.incident.id) }))
		.filter((row) => filters.status === null || row.run?.status === filters.status);
	return {
		title: 'Incident Ledger',
		displayed,
		serviceRows,
		filters,
		hasFilters: [...url.searchParams.values()].some(Boolean)
	};
};
