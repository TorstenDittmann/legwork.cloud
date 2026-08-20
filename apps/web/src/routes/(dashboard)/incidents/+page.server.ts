import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { analysisRuns, createDatabase, incidents, services } from '@legwork/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;
const RUN_STATUSES = [
	'queued',
	'provisioning',
	'analyzing',
	'completed',
	'inconclusive',
	'failed',
	'cancelled'
];
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'unknown'];

function parseDate(value: string | null): Date | null {
	if (value === null) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
		to: param('to'),
		q: param('q')?.trim().slice(0, 200) || null
	};
	const page = Math.max(1, Math.trunc(Number(param('page'))) || 1);
	const db = createDatabase();
	const conditions = [eq(incidents.organizationId, tenant.organizationId)];
	if (filters.severity !== null && SEVERITIES.includes(filters.severity))
		conditions.push(eq(incidents.severity, filters.severity as 'critical'));
	if (filters.service !== null) conditions.push(eq(incidents.serviceId, filters.service));
	const from = parseDate(filters.from);
	if (from) conditions.push(gte(incidents.occurredAt, from));
	const to = filters.to === null ? null : parseDate(`${filters.to}T23:59:59.999Z`);
	if (to) conditions.push(lte(incidents.occurredAt, to));
	if (filters.q !== null) {
		const pattern = `%${filters.q.replaceAll(/[\\%_]/g, '\\$&')}%`;
		conditions.push(sql`${incidents.title} like ${pattern} escape '\\'`);
	}
	// Filter on the latest run's status inside SQL. Filtering in memory after a
	// page cap silently dropped matches that fell outside the newest page.
	if (filters.status !== null && RUN_STATUSES.includes(filters.status))
		conditions.push(
			sql`(
				select runs.status from ${analysisRuns} as runs
				where runs.incident_id = ${incidents.id}
					and runs.organization_id = ${tenant.organizationId}
				order by runs.created_at desc, runs.id desc
				limit 1
			) = ${filters.status}`
		);
	const [[totalRow], rows, serviceRows] = await Promise.all([
		db
			.select({ value: count() })
			.from(incidents)
			.where(and(...conditions)),
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
			.orderBy(desc(incidents.occurredAt), desc(incidents.id))
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
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
	const total = totalRow?.value ?? 0;
	return {
		title: 'Incident Ledger',
		displayed: rows.map((row) => ({ ...row, run: runByIncident.get(row.incident.id) })),
		serviceRows,
		filters,
		page,
		pageSize: PAGE_SIZE,
		pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		total,
		hasFilters: [...url.searchParams.entries()].some(([name, value]) => name !== 'page' && value)
	};
};
