import { withAuth } from "@workos-inc/authkit-nextjs";
import { AuthenticationError, requireTenant } from "@oncall-ai/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
	const session = await withAuth();
	if (!session.user) redirect("/sign-in");
	if (!session.organizationId) redirect("/onboarding");
	try {
		await requireTenant();
	} catch (error) {
		if (error instanceof AuthenticationError) redirect("/onboarding");
		throw error;
	}
	return <DashboardShell>{children}</DashboardShell>;
}
