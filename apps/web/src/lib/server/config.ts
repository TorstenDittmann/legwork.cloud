import { WorkOS } from '@workos-inc/node';
import { env } from '$env/dynamic/private';

export function requireEncryptionKey(): string {
	const value = env.DATA_ENCRYPTION_KEY;
	if (!value) throw new Error('DATA_ENCRYPTION_KEY is required');
	return value;
}

export function createWorkOS(): WorkOS {
	if (!env.WORKOS_API_KEY) throw new Error('WORKOS_API_KEY is required');
	return env.WORKOS_CLIENT_ID
		? new WorkOS(env.WORKOS_API_KEY, { clientId: env.WORKOS_CLIENT_ID })
		: new WorkOS(env.WORKOS_API_KEY);
}
