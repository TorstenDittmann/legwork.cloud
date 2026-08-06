import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { auditEvents, createDatabase, serviceApiKeys, services } from "@oncall-ai/db";
import { generateApiKey } from "@oncall-ai/security";
import { HttpProblem, problemResponse } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ serviceId: string }> }) {
  try {
    const tenant = await requireTenant("admin"); const { serviceId } = await context.params; const db = createDatabase();
    const [service] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId))).limit(1);
    if (!service) throw new HttpProblem(404, "Not Found", "Service not found");
    const key = generateApiKey();
    await db.transaction(async (tx) => {
      await tx.update(serviceApiKeys).set({ active: false, revokedAt: new Date() }).where(and(eq(serviceApiKeys.serviceId, serviceId), eq(serviceApiKeys.organizationId, tenant.organizationId), eq(serviceApiKeys.active, true)));
      await tx.insert(serviceApiKeys).values({ organizationId: tenant.organizationId, serviceId, prefix: key.prefix, keyHash: key.hash });
      await tx.insert(auditEvents).values({ organizationId: tenant.organizationId, actorId: tenant.userId, action: "service.key_rotated", targetType: "service", targetId: serviceId });
    });
    return NextResponse.json({ ingestionKey: key.plaintext }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return problemResponse(error); }
}
