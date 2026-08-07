import { signOut, switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { WorkOS } from "@workos-inc/node";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";

export async function DashboardShell({ children }: { children: React.ReactNode }) {
	const session = await withAuth();
	if (!session.user) redirect("/sign-in");
	let organizations: Array<{ id: string; name: string }> = [];
	if (process.env.WORKOS_API_KEY) {
		const workos = new WorkOS(process.env.WORKOS_API_KEY);
		const memberships = await workos.userManagement.listOrganizationMemberships({
			userId: session.user.id,
		});
		organizations = await Promise.all(
			memberships.data
				.filter(({ status }) => status === "active")
				.map(async ({ organizationId }) => {
					const organization = await workos.organizations.getOrganization(organizationId);
					return { id: organization.id, name: organization.name };
				}),
		);
	}
	async function changeOrganization(formData: FormData) {
		"use server";
		await switchToOrganization(String(formData.get("organizationId")));
	}
	async function logout() {
		"use server";
		await signOut();
	}
	return (
		<div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
			<a
				href="#main-content"
				className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-[3px] bg-[var(--ink)] px-3 py-2 text-sm text-[var(--canvas)] transition-transform focus:translate-y-0"
			>
				Skip to Main Content
			</a>
			<AppNavigation
				organizations={organizations}
				organizationId={session.organizationId ?? ""}
				email={session.user.email}
				changeOrganization={changeOrganization}
				logout={logout}
			/>
			<main
				id="main-content"
				className="min-w-0 px-4 pb-16 pt-24 sm:px-7 lg:px-10 lg:py-10 xl:px-14"
			>
				<div className="mx-auto max-w-[1320px]">{children}</div>
			</main>
		</div>
	);
}
