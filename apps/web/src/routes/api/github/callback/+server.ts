import { isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { auditEvents, createDatabase, githubInstallations } from '@legwork/db';
import { verifyInstallationState } from '@legwork/github';
import { HttpProblem, problemResponse } from '$lib/server/http';
import { enqueueGitHubSync } from '$lib/server/queue';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals, 'admin');
		const url = event.url;
		const state = url.searchParams.get('state');
		const installationNumber = Number(url.searchParams.get('installation_id'));
		if (
			!state ||
			!Number.isSafeInteger(installationNumber) ||
			installationNumber <= 0 ||
			!env.GITHUB_INSTALLATION_STATE_SECRET
		)
			throw new HttpProblem(
				400,
				'Invalid GitHub Callback',
				'Missing or invalid installation callback parameters'
			);
		const verified = verifyInstallationState(state, env.GITHUB_INSTALLATION_STATE_SECRET);
		if (verified.organizationId !== tenant.organizationId)
			throw new HttpProblem(403, 'Forbidden', 'Installation state belongs to another organization');
		const db = createDatabase();
		const [existing] = await db
			.select()
			.from(githubInstallations)
			.where(eq(githubInstallations.installationId, installationNumber))
			.limit(1);
		if (existing && existing.organizationId !== tenant.organizationId)
			throw new HttpProblem(
				409,
				'Installation Already Connected',
				'This GitHub installation belongs to another organization'
			);
		const [installation] = existing
			? [existing]
			: await db
					.insert(githubInstallations)
					.values({
						organizationId: tenant.organizationId,
						installationId: installationNumber,
						accountLogin: 'pending-sync',
						accountId: installationNumber
					})
					.returning();
		if (!installation) throw new Error('Failed to persist GitHub installation');
		await db.insert(auditEvents).values({
			organizationId: tenant.organizationId,
			actorId: tenant.userId,
			action: 'github.connected',
			targetType: 'github_installation',
			targetId: installation.id,
			metadata: { installationId: installationNumber }
		});
		await enqueueGitHubSync(installation.id);
		redirect(307, `${env.APP_URL ?? url.origin}/dashboard?connected=1`);
	} catch (error) {
		if (isRedirect(error) || isHttpError(error)) throw error;
		return problemResponse(error);
	}
};
