import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, githubInstallations, repositories } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
			<div className="flex items-end justify-between">
				<div>
					<p className="font-mono text-xs uppercase tracking-widest text-cyan-400">
						Read-only GitHub App
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-white">Repositories</h1>
				</div>
				{tenant.role === "admin" && (
					<Button asChild>
						<Link href="/api/github/install">
							{installs.length ? "Manage installation" : "Connect GitHub"}
						</Link>
					</Button>
				)}
			</div>
			<p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
				Only selected repositories can be attached to services. OnCall AI stores numeric IDs and
				mints short-lived, repository-restricted tokens only inside the worker.
			</p>
			<div className="mt-8 space-y-3">
				{rows.map((repository) => (
					<Card key={repository.id}>
						<CardContent className="flex items-center justify-between pt-6">
							<div>
								<p className="font-medium text-white">{repository.fullName}</p>
								<p className="mt-1 text-xs text-slate-500">
									default: {repository.defaultBranch}
									{repository.removedAt ? " · removed from installation" : ""}
								</p>
							</div>
							{tenant.role === "admin" && !repository.removedAt && (
								<RepositoryToggle id={repository.id} initial={repository.selected} />
							)}
						</CardContent>
					</Card>
				))}
				{rows.length === 0 && (
					<p className="text-sm text-slate-500">No synchronized repositories.</p>
				)}
			</div>
		</>
	);
}
