import Link from "next/link";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { analysisRuns, createDatabase, incidents, services } from "@oncall-ai/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
			<div className="flex items-end justify-between">
				<div>
					<p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
						30-day retention
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-white">Incidents</h1>
				</div>
				<Button asChild>
					<Link href="/incidents/new">Manual incident</Link>
				</Button>
			</div>
			<form className="mt-8 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-6">
				<select
					name="status"
					defaultValue={typeof filters.status === "string" ? filters.status : ""}
					className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
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
				</select>
				<select
					name="severity"
					defaultValue={typeof filters.severity === "string" ? filters.severity : ""}
					className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
				>
					<option value="">All severities</option>
					{["critical", "high", "medium", "low", "unknown"].map((value) => (
						<option key={value}>{value}</option>
					))}
				</select>
				<select
					name="service"
					defaultValue={typeof filters.service === "string" ? filters.service : ""}
					className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm"
				>
					<option value="">All services</option>
					{serviceRows.map((service) => (
						<option key={service.id} value={service.id}>
							{service.name}
						</option>
					))}
				</select>
				<Input
					name="from"
					aria-label="From date"
					type="date"
					defaultValue={typeof filters.from === "string" ? filters.from : ""}
				/>
				<Input
					name="to"
					aria-label="To date"
					type="date"
					defaultValue={typeof filters.to === "string" ? filters.to : ""}
				/>
				<Button type="submit" variant="outline">
					Filter
				</Button>
			</form>
			<div className="mt-6 space-y-3">
				{displayed.map(({ incident, serviceName, run }) => (
					<Card key={incident.id}>
						<CardContent className="grid items-center gap-4 pt-6 md:grid-cols-[1fr_auto_auto]">
							<div>
								<Link
									href={`/incidents/${incident.id}`}
									className="font-medium text-white hover:text-cyan-300"
								>
									{incident.title}
								</Link>
								<p className="mt-1 text-xs text-slate-500">
									{serviceName} · {incident.occurredAt.toLocaleString()}
								</p>
							</div>
							<Badge>{incident.severity}</Badge>
							<Badge
								className={run?.status === "completed" ? "border-emerald-800 text-emerald-300" : ""}
							>
								{run?.status ?? "queued"}
							</Badge>
						</CardContent>
					</Card>
				))}
				{displayed.length === 0 && (
					<p className="text-sm text-slate-500">No incidents match these filters.</p>
				)}
			</div>
		</>
	);
}
