import { and, eq } from "drizzle-orm";
import { Agent, request } from "undici";
import type { CallbackEvent, CallbackPayload } from "@oncall-ai/contracts";
import { analysisRuns, callbackDeliveries, createDatabase, diagnoses, incidents, services } from "@oncall-ai/db";
import { callbackAttempts } from "@oncall-ai/observability";
import { decryptSecret, resolveSafeCallbackUrl, signCallback } from "@oncall-ai/security";

export class CallbackRetryError extends Error { constructor(message: string, readonly delaySeconds: number) { super(message); } }
const retryDelays = [60, 300, 1_800, 7_200, 86_400] as const;

export async function deliverCallback(deliveryId: string, appUrl: string, encryptionKey: string): Promise<void> {
  const db = createDatabase();
  const [record] = await db.select({ delivery: callbackDeliveries, run: analysisRuns, incident: incidents, service: services, diagnosis: diagnoses.diagnosis })
    .from(callbackDeliveries)
    .innerJoin(analysisRuns, and(eq(analysisRuns.id, callbackDeliveries.runId), eq(analysisRuns.organizationId, callbackDeliveries.organizationId)))
    .innerJoin(incidents, and(eq(incidents.id, analysisRuns.incidentId), eq(incidents.organizationId, callbackDeliveries.organizationId)))
    .innerJoin(services, and(eq(services.id, incidents.serviceId), eq(services.organizationId, callbackDeliveries.organizationId)))
    .leftJoin(diagnoses, eq(diagnoses.runId, analysisRuns.id))
    .where(eq(callbackDeliveries.id, deliveryId)).limit(1);
  if (!record || !record.service.callbackUrl || !record.service.callbackSecretCiphertext || record.delivery.status === "delivered") return;

  const event: CallbackEvent = record.run.status === "completed" ? "analysis.completed" : record.run.status === "inconclusive" ? "analysis.inconclusive" : "analysis.failed";
  const payload: CallbackPayload = {
    schemaVersion: "1", event, incidentId: record.incident.id, runId: record.run.id,
    status: record.run.status === "completed" ? "completed" : record.run.status === "inconclusive" ? "inconclusive" : "failed",
    summary: record.diagnosis?.summary ?? null, confidence: record.diagnosis?.rootCause?.confidence ?? null,
    dashboardUrl: `${appUrl}/incidents/${record.incident.id}`, completedAt: (record.run.completedAt ?? new Date()).toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1_000);
  let dispatcher: Agent | undefined;
  try {
    const secret = decryptSecret(record.service.callbackSecretCiphertext, encryptionKey, `service:${record.service.id}:callback`);
    const resolved = await resolveSafeCallbackUrl(record.service.callbackUrl);
    let addressIndex = 0;
    dispatcher = new Agent({ connect: { lookup: (_hostname, _options, callback) => {
      const address = resolved.addresses[addressIndex++ % resolved.addresses.length];
      if (!address) return callback(new Error("No approved callback address"), "", 4);
      callback(null, address, address.includes(":") ? 6 : 4);
    } } });
    const response = await request(resolved.url, {
      method: "POST", dispatcher, body: rawBody,
      headers: {
        "content-type": "application/json", "x-oncallai-event": event,
        "x-oncallai-delivery": record.delivery.id, "x-oncallai-timestamp": String(timestamp),
        "x-oncallai-signature": signCallback(timestamp, rawBody, secret),
      },
      headersTimeout: 10_000, bodyTimeout: 10_000,
    });
    await response.body.dump();
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Callback returned ${response.statusCode}`);
    callbackAttempts.inc({ result: "delivered" });
    await db.update(callbackDeliveries).set({ status: "delivered", deliveredAt: new Date(), responseStatus: response.statusCode, updatedAt: new Date() }).where(eq(callbackDeliveries.id, deliveryId));
  } catch (error) {
    callbackAttempts.inc({ result: "failed" });
    const nextAttempt = record.delivery.attempt + 1;
    const delay = retryDelays[record.delivery.attempt];
    await db.update(callbackDeliveries).set({
      attempt: nextAttempt, status: delay ? "retrying" : "permanently_failed",
      error: error instanceof Error ? error.message.slice(0, 2_000) : "Callback failed",
      nextAttemptAt: delay ? new Date(Date.now() + delay * 1_000) : null, updatedAt: new Date(),
    }).where(eq(callbackDeliveries.id, deliveryId));
    if (delay) throw new CallbackRetryError("Callback delivery failed", delay);
  } finally { await dispatcher?.close(); }
}
