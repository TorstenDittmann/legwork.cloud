import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { createDatabase, githubInstallations, repositories } from '@oncall-ai/db';
import { verifyGitHubWebhook } from '@oncall-ai/github';
import { problemResponse, readLimitedBytes } from '$lib/server/http';
import type { RequestHandler } from './$types';

interface HookRepository {
	id: number;
	name: string;
	full_name: string;
	owner: { login: string };
	default_branch: string;
	archived?: boolean;
}
interface HookPayload {
	action?: string;
	installation?: {
		id: number;
		account: { id: number; login: string };
		suspended_at?: string | null;
	};
	repositories_added?: HookRepository[];
	repositories_removed?: HookRepository[];
	repositories?: HookRepository[];
}

export const POST: RequestHandler = async (event) => {
	const request = event.request;
	let raw: string;
	try {
		raw = new TextDecoder().decode(await readLimitedBytes(request));
	} catch (error) {
		return problemResponse(error);
	}
	if (
		!env.GITHUB_WEBHOOK_SECRET ||
		!verifyGitHubWebhook(raw, request.headers.get('x-hub-signature-256'), env.GITHUB_WEBHOOK_SECRET)
	)
		return json({ error: 'Invalid signature' }, { status: 401 });
	const payload = JSON.parse(raw) as HookPayload;
	const installationId = payload.installation?.id;
	if (!installationId) return json({ accepted: true }, { status: 202 });
	const db = createDatabase();
	const [installation] = await db
		.select()
		.from(githubInstallations)
		.where(eq(githubInstallations.installationId, installationId))
		.limit(1);
	if (!installation) return json({ accepted: true }, { status: 202 });
	if (payload.action === 'deleted')
		await db
			.update(githubInstallations)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(githubInstallations.id, installation.id));
	else if (payload.action === 'suspend')
		await db
			.update(githubInstallations)
			.set({ suspendedAt: new Date(), updatedAt: new Date() })
			.where(eq(githubInstallations.id, installation.id));
	else if (payload.action === 'unsuspend')
		await db
			.update(githubInstallations)
			.set({ suspendedAt: null, updatedAt: new Date() })
			.where(eq(githubInstallations.id, installation.id));
	if (payload.installation?.account)
		await db
			.update(githubInstallations)
			.set({
				accountId: payload.installation.account.id,
				accountLogin: payload.installation.account.login,
				updatedAt: new Date()
			})
			.where(eq(githubInstallations.id, installation.id));
	const additions = payload.repositories_added ?? payload.repositories ?? [];
	for (const repository of additions)
		await db
			.insert(repositories)
			.values({
				organizationId: installation.organizationId,
				githubInstallationId: installation.id,
				githubRepositoryId: repository.id,
				owner: repository.owner.login,
				name: repository.name,
				fullName: repository.full_name,
				defaultBranch: repository.default_branch,
				archived: repository.archived ?? false
			})
			.onConflictDoUpdate({
				target: repositories.githubRepositoryId,
				set: {
					owner: repository.owner.login,
					name: repository.name,
					fullName: repository.full_name,
					defaultBranch: repository.default_branch,
					archived: repository.archived ?? false,
					removedAt: null,
					updatedAt: new Date()
				}
			});
	const removed = payload.repositories_removed?.map((repository) => repository.id) ?? [];
	if (removed.length)
		await db
			.update(repositories)
			.set({ selected: false, removedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(repositories.organizationId, installation.organizationId),
					inArray(repositories.githubRepositoryId, removed)
				)
			);
	return json({ accepted: true }, { status: 202 });
};
