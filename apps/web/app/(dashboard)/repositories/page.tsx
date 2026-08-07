import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, githubInstallations, repositories } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/journal";
import { RepositoryToggle } from "./repository-toggle";
export default async function RepositoriesPage() {
	const tenant = await requireTenant();
	const db = createDatabase();
	const [rows, installs] = await Promise.all([
		db.select().from(repositories).where(eq(repositories.organizationId, tenant.organizationId)),
		db
			.select()
			.from(githubInstallations)
			.where(eq(githubInstallations.organizationId, tenant.organizationId)),
	]);
	return (
		<>
			<PageHeader
				eyebrow="Read-only GitHub App"
				title="Repositories"
				description="Only included repositories can be attached to services. Installation credentials remain worker-only."
				actions={
					tenant.role === "admin" && (
						<Button asChild>
							<Link href="/api/github/install">
								{installs.length ? "Manage installation" : "Connect GitHub"}
							</Link>
						</Button>
					)
				}
			/>
			<div className="mt-8">
				{rows.length ? (
					<div className="rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]">
						{rows.map((repository) => (
							<div
								key={repository.id}
								className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-4 py-5 last:border-0"
							>
								<div>
									<p
										translate="no"
										className="font-display text-lg font-semibold tracking-[-0.01em]"
									>
										{repository.fullName}
									</p>
									<p className="mt-1 font-mono text-[10px] text-ink-faint">
										default: {repository.defaultBranch}
										{repository.removedAt ? " · removed from installation" : ""}
									</p>
								</div>
								{tenant.role === "admin" && !repository.removedAt && (
									<RepositoryToggle id={repository.id} initial={repository.selected} />
								)}
							</div>
						))}
					</div>
				) : (
					<EmptyState title="No Synchronized Repositories">
						Connect or refresh the GitHub App installation to discover repositories.
					</EmptyState>
				)}
			</div>
		</>
	);
}
