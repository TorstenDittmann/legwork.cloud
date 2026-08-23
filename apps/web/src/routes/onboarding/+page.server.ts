import { fail, redirect, type Cookies } from '@sveltejs/kit';
import { authKit } from '@workos/authkit-sveltekit';
import { createDatabase, organizations } from '@legwork/db';
import { createWorkOS } from '$lib/server/config';
import { isOnboarded } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const slugify = (name: string, id: string) =>
	`${
		name
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, '-')
			.replaceAll(/^-|-$/g, '')
			.slice(0, 96) || 'organization'
	}-${id.slice(-8).toLowerCase()}`;

function safeReturnTo(value: FormDataEntryValue | string | null): string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
		? value
		: '/setup';
}

// AuthKit's switchOrganization returns a Response carrying the refreshed
// session cookies; copy them onto the action's cookies before redirecting.
function forwardSetCookies(cookies: Cookies, response: Response) {
	for (const header of response.headers.getSetCookie()) {
		const [pair, ...attributes] = header.split(';');
		const separator = pair.indexOf('=');
		const cookieName = pair.slice(0, separator).trim();
		const cookieValue = pair.slice(separator + 1);
		const options: Parameters<Cookies['set']>[2] = {
			path: '/',
			httpOnly: false,
			secure: false,
			encode: (value) => value
		};
		for (const attribute of attributes) {
			const [rawName, ...rawValue] = attribute.split('=');
			const attributeName = rawName.trim().toLowerCase();
			const attributeValue = rawValue.join('=').trim();
			if (attributeName === 'path') options.path = attributeValue;
			else if (attributeName === 'domain') options.domain = attributeValue;
			else if (attributeName === 'max-age') options.maxAge = Number(attributeValue);
			else if (attributeName === 'expires') options.expires = new Date(attributeValue);
			else if (attributeName === 'samesite')
				options.sameSite = attributeValue.toLowerCase() as 'lax' | 'strict' | 'none';
			else if (attributeName === 'httponly') options.httpOnly = true;
			else if (attributeName === 'secure') options.secure = true;
		}
		cookies.set(cookieName, cookieValue, options);
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	if (!locals.auth.user) redirect(302, await authKit.getSignInUrl({ returnTo: '/onboarding' }));
	if (await isOnboarded(locals)) redirect(302, returnTo);
	return { organizationId: locals.auth.organizationId ?? null, returnTo };
};

export const actions: Actions = {
	complete: async (event) => {
		const { locals, request } = event;
		if (!locals.auth.user) throw new Error('Authentication required');
		const formData = await request.formData();
		const returnTo = safeReturnTo(formData.get('returnTo'));
		if (await isOnboarded(locals)) redirect(303, returnTo);
		const workos = createWorkOS();
		let workosOrganizationId = locals.auth.organizationId;
		let name: string;
		if (workosOrganizationId) {
			const organization = await workos.organizations.getOrganization(workosOrganizationId);
			name = organization.name;
		} else {
			name = String(formData.get('name') ?? '').trim();
			if (name.length < 2 || name.length > 255)
				return fail(400, { message: 'Organization name must be 2–255 characters' });
			const organization = await workos.organizations.createOrganization({ name });
			workosOrganizationId = organization.id;
			await workos.userManagement.createOrganizationMembership({
				organizationId: organization.id,
				userId: locals.auth.user.id,
				roleSlug: 'admin'
			});
		}
		await createDatabase()
			.insert(organizations)
			.values({ workosOrganizationId, name, slug: slugify(name, workosOrganizationId) })
			.onConflictDoUpdate({
				target: organizations.workosOrganizationId,
				set: { name, updatedAt: new Date() }
			});
		forwardSetCookies(
			event.cookies,
			await authKit.switchOrganization(event, { organizationId: workosOrganizationId })
		);
		redirect(302, returnTo);
	}
};
