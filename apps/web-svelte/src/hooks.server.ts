import { configureAuthKit, authKitHandle } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';

// Configure AuthKit with SvelteKit's environment variables. The redirect URI
// falls back to the NEXT_PUBLIC_ name still used by the repo-root .env files.
configureAuthKit({
	clientId: env.WORKOS_CLIENT_ID!,
	apiKey: env.WORKOS_API_KEY!,
	redirectUri: env.WORKOS_REDIRECT_URI!,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD!
});

export const handle = authKitHandle();
