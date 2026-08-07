import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, services } from "@oncall-ai/db";
import { ManualIncidentForm } from "./manual-form";
import { PageHeader } from "@/components/ui/journal";
export default async function NewIncidentPage() {
	const tenant = await requireTenant();
	const rows = await createDatabase()
		.select({ id: services.id, name: services.name })
		.from(services)
		.where(and(eq(services.organizationId, tenant.organizationId), eq(services.enabled, true)));
	return (
		<>
			<PageHeader
				eyebrow="Manual intake"
				title="Submit an Incident"
				description="Provide the failure signal and enough operational context to begin a repository investigation."
			/>
			<div className="mt-8">
				<ManualIncidentForm services={rows} />
			</div>
		</>
	);
}
