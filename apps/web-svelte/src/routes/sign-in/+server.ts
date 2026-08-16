import { redirect } from '@sveltejs/kit';
import { authKit } from '@workos/authkit-sveltekit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Match the Next.js app: after authentication, land on onboarding, which
	// forwards fully onboarded organizations to the dashboard.
	const signInUrl = await authKit.getSignInUrl({ returnTo: '/onboarding' });
	throw redirect(302, signInUrl);
};
