import Link from "next/link";
import { signOut, switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { WorkOS } from "@workos-inc/node";
import { Github, LogOut, Radio, Settings, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";

const links = [
	["/incidents", Siren, "Incidents"],
	["/services", Radio, "Services"],
	["/repositories", Github, "Repositories"],
	["/settings", Settings, "Settings"],
] as const;
export async function DashboardShell({ children }: { children: React.ReactNode }) {
	const session = await withAuth({ ensureSignedIn: true });
	let organizations: Array<{ id: string; name: string }> = [];
	if (session.user && process.env.WORKOS_API_KEY) {
		const workos = new WorkOS(process.env.WORKOS_API_KEY);
		const memberships = await workos.userManagement.listOrganizationMemberships({
			userId: session.user.id,
		});
		organizations = await Promise.all(
			memberships.data
				.filter((membership) => membership.status === "active")
				.map(async (membership) => {
					const organization = await workos.organizations.getOrganization(
						membership.organizationId,
					);
					return { id: organization.id, name: organization.name };
				}),
		);
	}
	async function changeOrganization(formData: FormData) {
		"use server";
		const id = String(formData.get("organizationId"));
		await switchToOrganization(id);
	}
	async function logout() {
		"use server";
		await signOut();
	}
	return (
		<div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
			<aside className="border-r border-slate-800 bg-slate-950/80 p-5">
				<Link href="/dashboard" className="text-lg font-semibold text-white">
					OnCall<span className="text-cyan-400">AI</span>
				</Link>
				{organizations.length > 0 && (
					<form action={changeOrganization} className="mt-7">
						<select
							name="organizationId"
							defaultValue={session.organizationId}
							className="h-9 w-full rounded border border-slate-800 bg-slate-950 px-2 text-xs text-slate-300"
						>
							{organizations.map((organization) => (
								<option key={organization.id} value={organization.id}>
									{organization.name}
								</option>
							))}
						</select>
						<Button type="submit" size="sm" variant="ghost" className="mt-1 w-full">
							Switch organization
						</Button>
					</form>
				)}
				<nav className="mt-8 space-y-1">
					{links.map(([href, Icon, label]) => (
						<Link
							key={href}
							href={href}
							className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-white"
						>
							<Icon className="size-4" />
							{label}
						</Link>
					))}
				</nav>
				<div className="mt-10 border-t border-slate-800 pt-4">
					<p className="truncate text-xs text-slate-500">{session.user?.email}</p>
					<form action={logout}>
						<Button type="submit" variant="ghost" size="sm" className="mt-2 w-full justify-start">
							<LogOut className="mr-2 size-4" />
							Sign out
						</Button>
					</form>
				</div>
			</aside>
			<main className="min-w-0 p-6 md:p-10">{children}</main>
		</div>
	);
}
