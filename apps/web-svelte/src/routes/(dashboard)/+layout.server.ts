import { AuthenticationError } from '@oncall-ai/auth/roles';
import { redirect } from '@sveltejs/kit';
import { WorkOS } from '@workos-inc/node';
import { env } from '$env/dynamic/private';
import { requireTenant } from '$lib/server/tenant';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.auth.user) redirect(302, '/sign-in');
	if (!locals.auth.organizationId) redirect(302, '/onboarding');
	try {
		await requireTenant(locals);
	} catch (error) {
		if (error instanceof AuthenticationError) redirect(302, '/onboarding');
		throw error;
	}
	let organizations: Array<{ id: string; name: string }> = [];
	if (env.WORKOS_API_KEY) {
		const workos = new WorkOS(env.WORKOS_API_KEY);
		const memberships = await workos.userManagement.listOrganizationMemberships({
			userId: locals.auth.user.id
		});
		organizations = await Promise.all(
			memberships.data
				.filter(({ status }) => status === 'active')
				.map(async ({ organizationId }) => {
					const organization = await workos.organizations.getOrganization(organizationId);
					return { id: organization.id, name: organization.name };
				})
		);
	}
	return {
		organizations,
		organizationId: locals.auth.organizationId ?? '',
		email: locals.auth.user.email
	};
};
