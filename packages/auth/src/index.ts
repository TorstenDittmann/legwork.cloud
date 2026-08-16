import { withAuth } from "@workos-inc/authkit-nextjs";
import { cache } from "react";
import type { OrganizationRole } from "./roles";
import { assertTenantRole, resolveTenantFromSession, type TenantContext } from "./tenant";
export * from "./roles";
export * from "./tenant";

const resolveTenant = cache(async (): Promise<TenantContext> => {
	const session = await withAuth();
	return resolveTenantFromSession({
		userId: session.user?.id,
		organizationId: session.organizationId,
		role: session.role,
		roles: session.roles,
	});
});

export async function requireTenant(
	requiredRole: OrganizationRole = "member",
): Promise<TenantContext> {
	return assertTenantRole(await resolveTenant(), requiredRole);
}
