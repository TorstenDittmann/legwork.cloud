import { and, eq } from "drizzle-orm";
import { createDatabase, serviceApiKeys, services } from "@oncall-ai/db";
import { hashApiKey } from "@oncall-ai/security";
import { HttpProblem } from "./http";

export async function authenticateServiceRequest(request: Request, slug: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpProblem(401, "Unauthorized", "A service bearer key is required");
  const candidate = authorization.slice(7);
  if (!candidate.startsWith("ocai_live_")) throw new HttpProblem(401, "Unauthorized", "Invalid service bearer key");
  const db = createDatabase();
  const [record] = await db.select({ service: services, keyId: serviceApiKeys.id }).from(serviceApiKeys)
    .innerJoin(services, and(eq(services.id, serviceApiKeys.serviceId), eq(services.organizationId, serviceApiKeys.organizationId)))
    .where(and(eq(serviceApiKeys.keyHash, hashApiKey(candidate)), eq(serviceApiKeys.active, true), eq(services.slug, slug), eq(services.enabled, true))).limit(1);
  if (!record) throw new HttpProblem(401, "Unauthorized", "Invalid service bearer key");
  await db.update(serviceApiKeys).set({ lastUsedAt: new Date() }).where(eq(serviceApiKeys.id, record.keyId));
  return record.service;
}
