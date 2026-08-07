import { withAuth } from "@workos-inc/authkit-nextjs";
import { createDatabase, findOrganizationByWorkosId } from "@oncall-ai/db";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
	const session = await withAuth();
	if (!session.user) redirect("/sign-in");
	if (!session.organizationId) redirect("/onboarding");
	const organization = await findOrganizationByWorkosId(createDatabase(), session.organizationId);
	if (!organization) redirect("/onboarding");
	return <DashboardShell>{children}</DashboardShell>;
}
