export type OrganizationRole = "admin" | "member";
export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
export function assertRole(actual: OrganizationRole, required: OrganizationRole): void {
  if (required === "admin" && actual !== "admin") throw new AuthorizationError("Organization admin access is required");
}
