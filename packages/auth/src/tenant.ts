import { createDatabase, findOrganizationByWorkosId } from "@oncall-ai/db";
import { AuthenticationError, AuthorizationError, type OrganizationRole } from "./roles";

export interface TenantContext {
	organizationId: string;
	workosOrganizationId: string;
	userId: string;
	role: OrganizationRole;
}

/** The framework-agnostic subset of an AuthKit session needed to resolve a tenant. */
export interface TenantSession {
	userId: string | null | undefined;
	organizationId: string | null | undefined;
	role?: string | null | undefined;
	roles?: string[] | null | undefined;
}

export async function resolveTenantFromSession(session: TenantSession): Promise<TenantContext> {
	if (!session.userId || !session.organizationId)
		throw new AuthenticationError("An active organization is required");
	const role: OrganizationRole =
		session.role === "admin" || session.roles?.includes("admin") ? "admin" : "member";
	const organization = await findOrganizationByWorkosId(createDatabase(), session.organizationId);
	if (!organization) throw new AuthenticationError("Organization onboarding is incomplete");
	return {
		organizationId: organization.id,
		workosOrganizationId: session.organizationId,
		userId: session.userId,
		role,
	};
}

export function assertTenantRole(
	tenant: TenantContext,
	requiredRole: OrganizationRole,
): TenantContext {
	if (requiredRole === "admin" && tenant.role !== "admin")
		throw new AuthorizationError("Organization admin access is required");
	return tenant;
}
