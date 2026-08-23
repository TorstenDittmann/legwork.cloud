import { loadSetupProgress } from '$lib/server/setup';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const tenant = await requireTenant(locals);
	const setup = await loadSetupProgress(tenant.organizationId);

	return {
		title: setup.activated ? 'Workspace Ready' : 'Workspace Setup',
		role: tenant.role,
		setup,
		connected: url.searchParams.get('connected') === '1',
		missing: url.searchParams.get('missing')
	};
};
