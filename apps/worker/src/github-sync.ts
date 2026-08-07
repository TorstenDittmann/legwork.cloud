import { and, eq, notInArray } from "drizzle-orm";
import { createDatabase, githubInstallations, repositories } from "@oncall-ai/db";
import { listInstallationRepositories } from "@oncall-ai/github";

export async function syncGitHubInstallation(
	id: string,
	appId: string,
	privateKey: string,
): Promise<void> {
	const db = createDatabase();
	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.id, id))
		.limit(1);
	if (!installation || installation.deletedAt || installation.suspendedAt)
		throw new Error("GITHUB_INSTALLATION_UNAVAILABLE");
	const remote = await listInstallationRepositories(
		{ appId, privateKey },
		installation.installationId,
	);
	for (const repository of remote)
		await db
			.insert(repositories)
			.values({
				organizationId: installation.organizationId,
				githubInstallationId: installation.id,
				...repository,
			})
			.onConflictDoUpdate({
				target: repositories.githubRepositoryId,
				set: {
					owner: repository.owner,
					name: repository.name,
					fullName: repository.fullName,
					defaultBranch: repository.defaultBranch,
					archived: repository.archived,
					removedAt: null,
					updatedAt: new Date(),
				},
			});
	const ids = remote.map((repository) => repository.githubRepositoryId);
	if (ids.length)
		await db
			.update(repositories)
			.set({ selected: false, removedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(repositories.githubInstallationId, installation.id),
					notInArray(repositories.githubRepositoryId, ids),
				),
			);
	else
		await db
			.update(repositories)
			.set({ selected: false, removedAt: new Date(), updatedAt: new Date() })
			.where(eq(repositories.githubInstallationId, installation.id));
}
