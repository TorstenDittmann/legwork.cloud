import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, services } from "@oncall-ai/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ServicesPage() {
	const tenant = await requireTenant();
	const rows = await createDatabase()
		.select()
		.from(services)
		.where(eq(services.organizationId, tenant.organizationId));
	return (
		<>
			<div className="flex items-end justify-between">
				<div>
					<p className="font-mono text-xs uppercase tracking-widest text-cyan-400">Configuration</p>
					<h1 className="mt-2 text-3xl font-semibold text-white">Services</h1>
				</div>
				{tenant.role === "admin" && (
					<Button asChild>
						<Link href="/services/new">New service</Link>
					</Button>
				)}
			</div>
			<div className="mt-8 space-y-3">
				{rows.map((service) => (
					<Card key={service.id}>
						<CardContent className="flex items-center justify-between pt-6">
							<div>
								<Link
									href={`/services/${service.id}`}
									className="font-medium text-white hover:text-cyan-300"
								>
									{service.name}
								</Link>
								<p className="mt-1 font-mono text-xs text-slate-500">
									/api/v1/services/{service.slug}/incidents
								</p>
							</div>
							<Badge className={service.enabled ? "border-emerald-800 text-emerald-300" : ""}>
								{service.enabled ? "enabled" : "disabled"}
							</Badge>
						</CardContent>
					</Card>
				))}
				{rows.length === 0 && (
					<p className="text-sm text-slate-500">No services yet. Connect GitHub and create one.</p>
				)}
			</div>
		</>
	);
}
