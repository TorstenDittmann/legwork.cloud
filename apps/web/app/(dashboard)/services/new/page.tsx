import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, repositories } from "@oncall-ai/db";
import { ServiceForm } from "./service-form";
export default async function NewServicePage() { const tenant = await requireTenant("admin"); const rows = await createDatabase().select({ id: repositories.id, fullName: repositories.fullName }).from(repositories).where(and(eq(repositories.organizationId, tenant.organizationId), eq(repositories.selected, true))); return <><h1 className="mb-8 text-3xl font-semibold text-white">New service</h1><ServiceForm repositories={rows} /></>; }
