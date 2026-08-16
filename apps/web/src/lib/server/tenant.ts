import { AuthenticationError, type OrganizationRole } from '@legwork/auth/roles';
import {
	assertTenantRole,
	resolveTenantFromSession,
	type TenantContext
} from '@legwork/auth/tenant';

// Memoize per request so multiple load functions and endpoints hitting
// requireTenant() in the same request share one organization lookup.
const pending = new WeakMap<App.Locals, Promise<TenantContext>>();

export async function requireTenant(
	locals: App.Locals,
	requiredRole: OrganizationRole = 'member'
): Promise<TenantContext> {
	let tenant = pending.get(locals);
	if (!tenant) {
		tenant = resolveTenantFromSession({
			userId: locals.auth?.user?.id,
			organizationId: locals.auth?.organizationId,
			role: locals.auth?.role
		});
		pending.set(locals, tenant);
	}
	return assertTenantRole(await tenant, requiredRole);
}

/**
 * Whether the session belongs to a fully onboarded organization. An
 * AuthenticationError from tenant resolution means onboarding is incomplete;
 * anything else propagates.
 */
export async function isOnboarded(locals: App.Locals): Promise<boolean> {
	try {
		await requireTenant(locals);
		return true;
	} catch (error) {
		if (error instanceof AuthenticationError) return false;
		throw error;
	}
}
