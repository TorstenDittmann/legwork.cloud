import { isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createInstallationState } from '@oncall-ai/github';
import { problemResponse } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals, 'admin');
		if (!env.GITHUB_INSTALLATION_STATE_SECRET || !env.GITHUB_APP_SLUG)
			throw new Error('GitHub App is not configured');
		const state = createInstallationState(
			tenant.organizationId,
			env.GITHUB_INSTALLATION_STATE_SECRET
		);
		redirect(
			307,
			`https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new?state=${encodeURIComponent(state)}`
		);
	} catch (error) {
		if (isRedirect(error) || isHttpError(error)) throw error;
		return problemResponse(error);
	}
};
