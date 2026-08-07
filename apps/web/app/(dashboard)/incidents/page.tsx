import Link from "next/link";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { analysisRuns, createDatabase, incidents, services } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/journal";
import { SeverityMark, StatusMark } from "@/components/ui/status";
import { formatDuration } from "@/lib/utils";

export default async function IncidentsPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const tenant = await requireTenant();
	const filters = await searchParams;
	const db = createDatabase();
	const conditions = [eq(incidents.organizationId, tenant.organizationId)];
	if (
		typeof filters.severity === "string" &&
		["critical", "high", "medium", "low", "unknown"].includes(filters.severity)
	)
		conditions.push(eq(incidents.severity, filters.severity as "critical"));
	if (typeof filters.service === "string")
		conditions.push(eq(incidents.serviceId, filters.service));
	if (typeof filters.from === "string")
		conditions.push(gte(incidents.occurredAt, new Date(filters.from)));
	if (typeof filters.to === "string")
		conditions.push(lte(incidents.occurredAt, new Date(`${filters.to}T23:59:59.999Z`)));
	const [rows, serviceRows] = await Promise.all([
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
			.where(and(...conditions))
			.orderBy(desc(incidents.occurredAt))
			.limit(100),
		db
			.select({ id: services.id, name: services.name })
			.from(services)
			.where(eq(services.organizationId, tenant.organizationId)),
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
							rows.map((row) => row.incident.id),
						),
					),
				)
				.orderBy(desc(analysisRuns.createdAt))
		: [];
	const displayed = rows
		.map((row) => ({ ...row, run: runs.find((run) => run.incidentId === row.incident.id) }))
		.filter((row) => typeof filters.status !== "string" || row.run?.status === filters.status);
	return (
		<>
			<PageHeader
				eyebrow="30-day retention"
				title="Incident Ledger"
				description="Every report, run, and verified conclusion in chronological order."
				actions={
					<Button asChild>
						<Link href="/incidents/new">Submit Incident</Link>
					</Button>
				}
			/>
			<form className="mt-7 grid gap-3 border-y border-[var(--rule)] py-4 md:grid-cols-6">
				<Field label="Status" htmlFor="status">
					<Select
						id="status"
						name="status"
						defaultValue={typeof filters.status === "string" ? filters.status : ""}
					>
						<option value="">All statuses</option>
						{[
							"queued",
							"provisioning",
							"analyzing",
							"completed",
							"inconclusive",
							"failed",
							"cancelled",
						].map((value) => (
							<option key={value}>{value}</option>
						))}
					</Select>
				</Field>
				<Field label="Severity" htmlFor="severity">
					<Select
						id="severity"
						name="severity"
						defaultValue={typeof filters.severity === "string" ? filters.severity : ""}
					>
						<option value="">All severities</option>
						{["critical", "high", "medium", "low", "unknown"].map((value) => (
							<option key={value}>{value}</option>
						))}
					</Select>
				</Field>
				<Field label="Service" htmlFor="service">
					<Select
						id="service"
						name="service"
						defaultValue={typeof filters.service === "string" ? filters.service : ""}
					>
						<option value="">All services</option>
						{serviceRows.map((service) => (
							<option key={service.id} value={service.id}>
								{service.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="From" htmlFor="from">
					<Input
						id="from"
						name="from"
						aria-label="From date"
						type="date"
						defaultValue={typeof filters.from === "string" ? filters.from : ""}
					/>
				</Field>
				<Field label="To" htmlFor="to">
					<Input
						id="to"
						name="to"
						aria-label="To date"
						type="date"
						defaultValue={typeof filters.to === "string" ? filters.to : ""}
					/>
				</Field>
				<div className="flex items-end gap-2">
					<Button type="submit" variant="outline">
						Filter
					</Button>
					{Object.values(filters).some(Boolean) && (
						<Button asChild variant="link">
							<Link href="/incidents">Clear</Link>
						</Button>
					)}
				</div>
			</form>
			<div className="mt-6">
				<div className="hidden grid-cols-[100px_minmax(0,1fr)_160px_160px_110px_100px] border-b border-[var(--rule-strong)] px-2 pb-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] md:grid">
					<span>Severity</span>
					<span>Incident</span>
					<span>Service</span>
					<span>Occurred</span>
					<span>Status</span>
					<span>Duration</span>
				</div>
				{displayed.map(({ incident, serviceName, run }) => (
					<div
						key={incident.id}
						className="content-auto grid gap-3 border-b border-[var(--rule)] py-4 md:grid-cols-[100px_minmax(0,1fr)_160px_160px_110px_100px] md:items-center md:px-2"
					>
						<SeverityMark severity={incident.severity} />
						<div className="min-w-0">
							<Link
								href={`/incidents/${incident.id}`}
								className="block truncate font-medium text-[var(--ink)] hover:text-[var(--accent)]"
							>
								{incident.title}
							</Link>
						</div>
						<span className="text-xs text-[var(--ink-muted)]">{serviceName}</span>
						<time className="font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
							{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
								incident.occurredAt,
							)}
						</time>
						<StatusMark status={run?.status ?? "queued"} />
						<span className="font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
							{run?.startedAt && run.completedAt
								? formatDuration(run.completedAt.getTime() - run.startedAt.getTime())
								: "—"}
						</span>
					</div>
				))}
				{displayed.length === 0 && (
					<EmptyState title="No Matching Incidents">
						Adjust the current filters or submit a new incident.
					</EmptyState>
				)}
			</div>
		</>
	);
}
