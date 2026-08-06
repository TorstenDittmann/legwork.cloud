import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, services } from "@oncall-ai/db";
import { ManualIncidentForm } from "./manual-form";
export default async function NewIncidentPage() { const tenant = await requireTenant(); const rows = await createDatabase().select({id:services.id,name:services.name}).from(services).where(and(eq(services.organizationId,tenant.organizationId),eq(services.enabled,true))); return <><h1 className="mb-8 text-3xl font-semibold text-white">Submit a manual incident</h1><ManualIncidentForm services={rows} /></>; }
