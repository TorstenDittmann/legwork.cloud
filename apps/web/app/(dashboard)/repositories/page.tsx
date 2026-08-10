import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, githubInstallations, repositories } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/journal";
import { RepositoryList } from "./repository-list";
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
				description="Included repositories provide source, recent Actions runs, and deployment context during investigations. Installation credentials remain worker-only."
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
			<div>
				{rows.length ? (
					<RepositoryList
						canManage={tenant.role === "admin"}
						initialRepositories={rows.map((repository) => ({
							id: repository.id,
							fullName: repository.fullName,
							defaultBranch: repository.defaultBranch,
							selected: repository.selected,
							archived: repository.archived,
							removedAt: repository.removedAt?.toISOString() ?? null,
						}))}
					/>
				) : (
					<div className="mt-8">
						<EmptyState title="No Synchronized Repositories">
							Connect or refresh the GitHub App installation to discover repositories.
						</EmptyState>
					</div>
				)}
			</div>
		</>
	);
}
