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
			<div className="mt-8">
				{rows.length ? (
					<div className="rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]">
						{rows.map((service) => (
							<div
								key={service.id}
								className="grid gap-3 border-b border-rule px-4 py-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-center"
							>
								<div>
									<Link
										href={`/services/${service.id}`}
										className="font-display text-lg font-semibold tracking-[-0.01em] text-ink hover:text-accent"
									>
										{service.name}
									</Link>
									<p className="mt-1 break-all font-mono text-[10px] text-ink-faint">
										/api/v1/services/{service.slug}/incidents
									</p>
								</div>
								<StatusMark
									status={service.enabled ? "enabled" : "disabled"}
									className="sm:justify-self-start"
								/>
							</div>
						))}
					</div>
				) : (
					<EmptyState title="No Services Yet">
						Connect GitHub, select a repository, and create the first intake endpoint.
					</EmptyState>
				)}
			</div>
		</>
	);
}
