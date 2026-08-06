import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, repositories, serviceApiKeys, serviceRepositories, services } from "@oncall-ai/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceEditor } from "./service-editor";

export default async function ServiceDetail({ params }: { params: Promise<{ serviceId: string }> }) {
  const tenant = await requireTenant();
  const { serviceId } = await params;
  const db = createDatabase();
  const [[row], mappings, repositoryOptions] = await Promise.all([
    db.select({ service: services, keyPrefix: serviceApiKeys.prefix }).from(services)
      .leftJoin(serviceApiKeys, and(eq(serviceApiKeys.serviceId, services.id), eq(serviceApiKeys.active, true)))
      .where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId))).limit(1),
    db.select({ repositoryId: serviceRepositories.repositoryId, role: serviceRepositories.role, fullName: repositories.fullName })
      .from(serviceRepositories).innerJoin(repositories, and(
        eq(repositories.id, serviceRepositories.repositoryId), eq(repositories.organizationId, tenant.organizationId),
      )).where(and(eq(serviceRepositories.serviceId, serviceId), eq(serviceRepositories.organizationId, tenant.organizationId))),
    db.select({ id: repositories.id, fullName: repositories.fullName }).from(repositories).where(and(
      eq(repositories.organizationId, tenant.organizationId), eq(repositories.selected, true),
    )),
  ]);
  if (!row) notFound();
  return <>
    <div className="flex items-center gap-3"><h1 className="text-3xl font-semibold text-white">{row.service.name}</h1><Badge>{row.service.enabled ? "enabled" : "disabled"}</Badge></div>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Ingestion</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-slate-400"><p>Slug: <code className="text-slate-200">{row.service.slug}</code></p><p>Active key: <code className="text-slate-200">{row.keyPrefix}…</code></p><p>The stable slug cannot be edited. The full key is only revealed on creation or rotation.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Repositories</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-slate-400">{mappings.map((mapping) => <p key={mapping.repositoryId}><Badge>{mapping.role}</Badge> <span className="ml-2">{mapping.fullName}</span></p>)}</CardContent></Card>
    </div>
    {tenant.role === "admin" && <Card className="mt-6"><CardHeader><CardTitle>Edit service</CardTitle></CardHeader><CardContent><ServiceEditor serviceId={serviceId} name={row.service.name} callbackUrl={row.service.callbackUrl} enabled={row.service.enabled} repositories={repositoryOptions} mappings={mappings} /></CardContent></Card>}
  </>;
}
