import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, services } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/journal";
import { StatusMark } from "@/components/ui/status";

export default async function ServicesPage() {
	const tenant = await requireTenant();
	const rows = await createDatabase()
		.select()
		.from(services)
		.where(eq(services.organizationId, tenant.organizationId));
	return (
		<>
			<PageHeader
				eyebrow="Configuration"
				title="Services"
				description="Map incident intake endpoints to the repositories that explain them."
				actions={
					tenant.role === "admin" && (
						<Button asChild>
							<Link href="/services/new">New Service</Link>
						</Button>
					)
				}
			/>
			<div className="mt-8 border-t border-[var(--rule-strong)]">
				{rows.map((service) => (
					<div
						key={service.id}
						className="grid gap-3 border-b border-[var(--rule)] py-5 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-center sm:px-2"
					>
						<div>
							<Link
								href={`/services/${service.id}`}
								className="font-display text-xl text-[var(--ink)] hover:text-[var(--accent)]"
							>
								{service.name}
							</Link>
							<p className="mt-1 break-all font-mono text-[10px] text-[var(--ink-faint)]">
								/api/v1/services/{service.slug}/incidents
							</p>
						</div>
						<StatusMark status={service.enabled ? "enabled" : "disabled"} />
					</div>
				))}
				{rows.length === 0 && (
					<EmptyState title="No Services Yet">
						Connect GitHub, select a repository, and create the first intake endpoint.
					</EmptyState>
				)}
			</div>
		</>
	);
}
