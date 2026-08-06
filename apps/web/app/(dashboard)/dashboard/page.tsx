import Link from "next/link";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { analysisRuns, createDatabase, incidents, services } from "@oncall-ai/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
	const tenant = await requireTenant();
	const db = createDatabase();
	const month = new Date();
	month.setUTCDate(1);
	month.setUTCHours(0, 0, 0, 0);
	const [[serviceCount], [incidentCount], [activeCount]] = await Promise.all([
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
	]);
	return (
		<>
			<div className="flex items-end justify-between">
				<div>
					<p className="font-mono text-xs uppercase tracking-widest text-cyan-400">Control plane</p>
					<h1 className="mt-2 text-3xl font-semibold text-white">Incident overview</h1>
				</div>
				<Button asChild>
					<Link href="/incidents/new">Submit incident</Link>
				</Button>
			</div>
			<div className="mt-8 grid gap-4 sm:grid-cols-3">
				{[
					["Services", serviceCount?.value ?? 0],
					["Incidents this month", incidentCount?.value ?? 0],
					["Active analyses", activeCount?.value ?? 0],
				].map(([label, value]) => (
					<Card key={label}>
						<CardHeader>
							<CardTitle className="text-sm text-slate-400">{label}</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-3xl font-semibold text-white">{value}</p>
						</CardContent>
					</Card>
				))}
			</div>
		</>
	);
}
