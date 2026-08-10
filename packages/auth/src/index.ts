import { withAuth } from "@workos-inc/authkit-nextjs";
import { createDatabase, findOrganizationByWorkosId } from "@oncall-ai/db";
import { cache } from "react";
import { AuthenticationError, AuthorizationError, type OrganizationRole } from "./roles";
export * from "./roles";

export interface TenantContext {
	organizationId: string;
	workosOrganizationId: string;
	userId: string;
	role: OrganizationRole;
}

const resolveTenant = cache(async (): Promise<TenantContext> => {
	const session = await withAuth();
	if (!session.user || !session.organizationId)
		throw new AuthenticationError("An active organization is required");
	const role: OrganizationRole =
		session.role === "admin" || session.roles?.includes("admin") ? "admin" : "member";
	const organization = await findOrganizationByWorkosId(createDatabase(), session.organizationId);
	if (!organization) throw new AuthenticationError("Organization onboarding is incomplete");
	return {
		organizationId: organization.id,
		workosOrganizationId: session.organizationId,
		userId: session.user.id,
		role,
	};
});

export async function requireTenant(
	requiredRole: OrganizationRole = "member",
): Promise<TenantContext> {
	const tenant = await resolveTenant();
	if (requiredRole === "admin" && tenant.role !== "admin")
		throw new AuthorizationError("Organization admin access is required");
	return tenant;
}
