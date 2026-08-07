import Link from "next/link";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { analysisRuns, createDatabase, incidents, services } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionHeader } from "@/components/ui/journal";
import { SeverityMark, StatusMark } from "@/components/ui/status";

export default async function DashboardPage() {
	const tenant = await requireTenant();
	const db = createDatabase();
	const month = new Date();
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	const [[serviceCount], [incidentCount], [activeCount], recent] = await Promise.all([
		db
			.select({ value: count() })
			.from(services)
			.where(eq(services.organizationId, tenant.organizationId)),
		db
			.select({ value: count() })
			.from(incidents)
			.where(
				and(eq(incidents.organizationId, tenant.organizationId), gte(incidents.createdAt, month)),
			),
		db
			.select({ value: count() })
			.from(analysisRuns)
			.where(
				and(
					eq(analysisRuns.organizationId, tenant.organizationId),
					inArray(analysisRuns.status, ["queued", "provisioning", "analyzing"]),
				),
			),
		db
			.select({ incident: incidents, serviceName: services.name })
			.from(incidents)
			.innerJoin(
				services,
				and(
					eq(services.id, incidents.serviceId),
					eq(services.organizationId, tenant.organizationId),
				),
			)
			.where(eq(incidents.organizationId, tenant.organizationId))
			.orderBy(desc(incidents.occurredAt))
			.limit(6),
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
							recent.map(({ incident }) => incident.id),
						),
					),
				)
				.orderBy(desc(analysisRuns.createdAt))
		: [];
	return (
		<>
			<PageHeader
				eyebrow="Operational briefing"
				title="Incident Overview"
				description={new Intl.DateTimeFormat("en", {
					month: "long",
					year: "numeric",
					timeZone: "UTC",
				}).format(month)}
				actions={
					<Button asChild>
						<Link href="/incidents/new">Submit Incident</Link>
					</Button>
				}
			/>
			<dl className="mt-7 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-3">
				{[
					["Services", serviceCount?.value ?? 0],
					["Incidents this month", incidentCount?.value ?? 0],
					["Active analyses", activeCount?.value ?? 0],
				].map(([label, value]) => (
					<div key={label} className="bg-surface px-5 py-4">
						<dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
							{label}
						</dt>
						<dd className="mt-2 font-display text-3xl font-semibold tabular-nums tracking-[-0.01em]">
							{value}
						</dd>
					</div>
				))}
			</dl>
			<section className="mt-12">
				<SectionHeader meta={`${recent.length} records`}>Recent Incidents</SectionHeader>
				{recent.length ? (
					<div className="rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]">
						{recent.map(({ incident, serviceName }) => {
							const run = recentRuns.find((candidate) => candidate.incidentId === incident.id);
							return (
								<Link
									key={incident.id}
									href={`/incidents/${incident.id}`}
									className="grid gap-3 border-b border-rule px-4 py-4 last:border-0 hover:bg-surface-raised/60 sm:grid-cols-[100px_minmax(0,1fr)_140px_120px] sm:items-center"
								>
									<SeverityMark severity={incident.severity} />
									<div className="min-w-0">
										<p className="truncate text-sm font-medium text-ink">{incident.title}</p>
										<p className="mt-1 text-xs text-ink-faint">{serviceName}</p>
									</div>
									<time className="font-mono text-[10px] tabular-nums text-ink-faint">
										{new Intl.DateTimeFormat("en", {
											dateStyle: "medium",
											timeStyle: "short",
										}).format(incident.occurredAt)}
									</time>
									<StatusMark status={run?.status ?? "queued"} className="justify-self-start" />
								</Link>
							);
						})}
					</div>
				) : (
					<EmptyState title="No Incidents Yet">
						Submit an incident to begin the first evidence-backed investigation.
					</EmptyState>
				)}
			</section>
		</>
	);
}
