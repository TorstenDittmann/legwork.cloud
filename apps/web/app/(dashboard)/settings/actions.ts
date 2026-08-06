"use server";
import { WorkOS } from "@workos-inc/node";
import { requireTenant } from "@oncall-ai/auth";
import { auditEvents, createDatabase } from "@oncall-ai/db";
import { revalidatePath } from "next/cache";

function client() {
  if (!process.env.WORKOS_API_KEY) throw new Error("WORKOS_API_KEY is required");
  return new WorkOS(process.env.WORKOS_API_KEY);
}
export async function inviteMember(formData: FormData) {
  const tenant = await requireTenant("admin"); const email = String(formData.get("email") ?? "").trim().toLowerCase(); const roleSlug = String(formData.get("role") ?? "member");
  if (!/^\S+@\S+\.\S+$/.test(email) || !["admin", "member"].includes(roleSlug)) throw new Error("A valid email and role are required");
  await client().userManagement.sendInvitation({ email, organizationId: tenant.workosOrganizationId, roleSlug, inviterUserId: tenant.userId });
  await createDatabase().insert(auditEvents).values({ organizationId: tenant.organizationId, actorId: tenant.userId, action: "member.invited", targetType: "invitation", metadata: { email, role: roleSlug } });
  revalidatePath("/settings");
}
export async function changeMemberRole(formData: FormData) {
  const tenant = await requireTenant("admin"); const membershipId = String(formData.get("membershipId")); const roleSlug = String(formData.get("role"));
  if (!membershipId.startsWith("om_") || !["admin", "member"].includes(roleSlug)) throw new Error("Invalid membership update");
  const workos = client(); const membership = await workos.userManagement.getOrganizationMembership(membershipId);
  if (membership.organizationId !== tenant.workosOrganizationId) throw new Error("Membership does not belong to the active organization");
  await workos.userManagement.updateOrganizationMembership(membershipId, { roleSlug });
  await createDatabase().insert(auditEvents).values({ organizationId: tenant.organizationId, actorId: tenant.userId, action: "member.role_changed", targetType: "membership", targetId: membershipId, metadata: { role: roleSlug } });
  revalidatePath("/settings");
}
export async function removeMember(formData: FormData) {
  const tenant = await requireTenant("admin"); const membershipId = String(formData.get("membershipId")); const userId = String(formData.get("userId"));
  if (userId === tenant.userId) throw new Error("You cannot remove your own active membership");
  const workos = client(); const membership = await workos.userManagement.getOrganizationMembership(membershipId);
  if (membership.organizationId !== tenant.workosOrganizationId || membership.userId !== userId) throw new Error("Membership does not belong to the active organization");
  await workos.userManagement.deleteOrganizationMembership(membershipId);
  await createDatabase().insert(auditEvents).values({ organizationId: tenant.organizationId, actorId: tenant.userId, action: "member.removed", targetType: "membership", targetId: membershipId, metadata: { userId } });
  revalidatePath("/settings");
}
