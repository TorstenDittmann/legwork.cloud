import { redirect } from '@sveltejs/kit';
import { authKit } from '@workos/authkit-sveltekit';
import type { RequestHandler } from './$types';

function safeReturnTo(value: string | null): string {
	return value?.startsWith('/') && !value.startsWith('//') ? value : '/onboarding';
}

export const GET: RequestHandler = async ({ url }) => {
	const signInUrl = await authKit.getSignInUrl({
		returnTo: safeReturnTo(url.searchParams.get('returnTo'))
	});
	throw redirect(302, signInUrl);
};
