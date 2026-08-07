import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, repositories } from "@oncall-ai/db";
import { ServiceForm } from "./service-form";
import { PageHeader } from "@/components/ui/journal";
export default async function NewServicePage() {
	const tenant = await requireTenant("admin");
	const rows = await createDatabase()
		.select({ id: repositories.id, fullName: repositories.fullName })
		.from(repositories)
		.where(
			and(eq(repositories.organizationId, tenant.organizationId), eq(repositories.selected, true)),
		);
	return (
		<>
			<PageHeader
				eyebrow="Configuration"
				title="New Service"
				description="Create a stable incident endpoint and bind it to the repositories the agent may inspect."
			/>
			<div className="mt-8">
				<ServiceForm repositories={rows} />
			</div>
		</>
	);
}
