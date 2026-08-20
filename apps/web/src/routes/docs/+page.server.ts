import { isOnboarded } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.auth.user) return { title: 'Documentation', authState: 'guest' as const };
	return {
		title: 'Documentation',
		authState: (await isOnboarded(locals)) ? ('onboarded' as const) : ('needs-onboarding' as const)
	};
};
