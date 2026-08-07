"use server";
import { switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { WorkOS } from "@workos-inc/node";
import { createDatabase, organizations } from "@oncall-ai/db";

function workosClient() {
	if (!process.env.WORKOS_API_KEY || !process.env.WORKOS_CLIENT_ID)
		throw new Error("WorkOS is not configured");
	return new WorkOS(process.env.WORKOS_API_KEY, { clientId: process.env.WORKOS_CLIENT_ID });
}
const slugify = (name: string, id: string) =>
	`${
		name
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, "-")
			.replaceAll(/^-|-$/g, "")
			.slice(0, 96) || "organization"
	}-${id.slice(-8).toLowerCase()}`;

export async function completeOnboarding(formData: FormData) {
	const session = await withAuth({ ensureSignedIn: true });
	if (!session.user) throw new Error("Authentication required");
	const workos = workosClient();
	let workosOrganizationId = session.organizationId;
	let name: string;
	if (workosOrganizationId) {
		const organization = await workos.organizations.getOrganization(workosOrganizationId);
		name = organization.name;
	} else {
		name = String(formData.get("name") ?? "").trim();
		if (name.length < 2 || name.length > 255)
			throw new Error("Organization name must be 2–255 characters");
		const organization = await workos.organizations.createOrganization({ name });
		workosOrganizationId = organization.id;
		await workos.userManagement.createOrganizationMembership({
			organizationId: organization.id,
			userId: session.user.id,
			roleSlug: "admin",
		});
	}
	await createDatabase()
		.insert(organizations)
		.values({ workosOrganizationId, name, slug: slugify(name, workosOrganizationId) })
		.onConflictDoUpdate({
			target: organizations.workosOrganizationId,
			set: { name, updatedAt: new Date() },
		});
	await switchToOrganization(workosOrganizationId, { returnTo: "/dashboard" });
}
