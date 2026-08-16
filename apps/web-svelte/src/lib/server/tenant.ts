import type { OrganizationRole } from '@oncall-ai/auth/roles';
import {
	assertTenantRole,
	resolveTenantFromSession,
	type TenantContext
} from '@oncall-ai/auth/tenant';

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
