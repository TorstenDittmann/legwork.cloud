import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createWorkOS } from '$lib/server/config';
import { isOnboarded } from '$lib/server/tenant';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.auth.user) redirect(302, '/sign-in');
	if (!locals.auth.organizationId) redirect(302, '/onboarding');
	if (!(await isOnboarded(locals))) redirect(302, '/onboarding');
	let organizations: Array<{ id: string; name: string }> = [];
	let email = locals.auth.user.email;
	if (env.WORKOS_API_KEY) {
		const workos = createWorkOS();
		const [memberships, user] = await Promise.all([
			workos.userManagement.listOrganizationMemberships({ userId: locals.auth.user.id }),
			workos.userManagement.getUser(locals.auth.user.id)
		]);
		organizations = memberships.data
			.filter(({ status }) => status === 'active')
			.map(({ organizationId, organizationName }) => ({
				id: organizationId,
				name: organizationName
			}));
		email = user.email;
	}
	return {
		organizations,
		organizationId: locals.auth.organizationId,
		email
	};
};
