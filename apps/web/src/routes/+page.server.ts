import { isOnboarded } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.auth.user) return { authState: 'guest' as const };
	return {
		authState: (await isOnboarded(locals)) ? ('onboarded' as const) : ('needs-onboarding' as const)
	};
};
