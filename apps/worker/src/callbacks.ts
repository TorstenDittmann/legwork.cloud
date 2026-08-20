import { and, eq, inArray } from "drizzle-orm";
import { Agent, request } from "undici";
import type { CallbackEvent, CallbackPayload } from "@legwork/contracts";
import {
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	diagnoses,
	enqueueJob,
	incidents,
	services,
	type Database,
} from "@legwork/db";
import { callbackAttempts } from "@legwork/observability";
import {
	decryptSecret,
	redactSecrets,
	resolveSafeCallbackUrl,
	signCallback,
} from "@legwork/security";

export interface CallbackPayloadInput {
	runStatus: string;
	incidentId: string;
	runId: string;
	summary: string | null;
	confidence: number | null;
	completedAt: Date | null;
	appUrl: string;
}

/**
 * Build the signed callback body. The summary is model output derived from
 * customer source code, so it is redacted before leaving the system.
 */
export function buildCallbackPayload(input: CallbackPayloadInput): CallbackPayload {
	const status =
		input.runStatus === "completed"
			? ("completed" as const)
			: input.runStatus === "inconclusive"
				? ("inconclusive" as const)
				: ("failed" as const);
	const event: CallbackEvent =
		status === "completed"
			? "analysis.completed"
			: status === "inconclusive"
				? "analysis.inconclusive"
				: "analysis.failed";
	return redactSecrets({
		schemaVersion: "1",
		event,
		incidentId: input.incidentId,
		runId: input.runId,
		status,
		summary: input.summary,
		confidence: input.confidence,
		dashboardUrl: `${input.appUrl}/incidents/${input.incidentId}`,
		completedAt: (input.completedAt ?? new Date()).toISOString(),
	});
}

export class CallbackRetryError extends Error {
	constructor(
		message: string,
		readonly delaySeconds: number,
	) {
		super(message);
	}
}
const retryDelays = [60, 300, 1_800, 7_200, 86_400] as const;

/** Enqueue the service-configured callback for a run that reached a terminal status. */
export async function enqueueAutomaticCallback(db: Database, runId: string): Promise<void> {
	const [record] = await db
		.select({ run: analysisRuns, service: services })
		.from(analysisRuns)
		.innerJoin(incidents, eq(incidents.id, analysisRuns.incidentId))
		.innerJoin(services, eq(services.id, incidents.serviceId))
		.where(eq(analysisRuns.id, runId))
		.limit(1);
	if (
		!record?.service.callbackUrl ||
		!["completed", "inconclusive", "failed"].includes(record.run.status)
	)
		return;
	const [existing] = await db
		.select({ id: callbackDeliveries.id })
		.from(callbackDeliveries)
		.where(
			and(
				eq(callbackDeliveries.runId, runId),
				inArray(callbackDeliveries.status, ["pending", "retrying", "delivered"]),
			),
		)
		.limit(1);
	if (existing) return;
	const [delivery] = await db
		.insert(callbackDeliveries)
		.values({
			organizationId: record.run.organizationId,
			runId,
			event:
				record.run.status === "completed"
					? "analysis.completed"
					: record.run.status === "inconclusive"
						? "analysis.inconclusive"
						: "analysis.failed",
			expiresAt: record.run.expiresAt,
		})
		.returning({ id: callbackDeliveries.id });
	if (delivery)
		await enqueueJob(
			db,
			"deliver-callback",
			{ deliveryId: delivery.id },
			{ singletonKey: delivery.id, maxAttempts: 6 },
		);
}

export async function deliverCallback(
	deliveryId: string,
	appUrl: string,
	encryptionKey: string,
): Promise<void> {
	const db = createDatabase();
	const [record] = await db
		.select({
			delivery: callbackDeliveries,
			run: analysisRuns,
			incident: incidents,
			service: services,
			diagnosis: diagnoses.diagnosis,
		})
		.from(callbackDeliveries)
		.innerJoin(
			analysisRuns,
			and(
				eq(analysisRuns.id, callbackDeliveries.runId),
				eq(analysisRuns.organizationId, callbackDeliveries.organizationId),
			),
		)
		.innerJoin(
			incidents,
			and(
				eq(incidents.id, analysisRuns.incidentId),
				eq(incidents.organizationId, callbackDeliveries.organizationId),
			),
		)
		.innerJoin(
			services,
			and(
				eq(services.id, incidents.serviceId),
				eq(services.organizationId, callbackDeliveries.organizationId),
			),
		)
		.leftJoin(diagnoses, eq(diagnoses.runId, analysisRuns.id))
		.where(eq(callbackDeliveries.id, deliveryId))
		.limit(1);
	if (
		!record ||
		!record.service.callbackUrl ||
		!record.service.callbackSecretCiphertext ||
		record.delivery.status === "delivered"
	)
		return;

	const payload = buildCallbackPayload({
		runStatus: record.run.status,
		incidentId: record.incident.id,
		runId: record.run.id,
		summary: record.diagnosis?.summary ?? null,
		confidence: record.diagnosis?.rootCause?.confidence ?? null,
		completedAt: record.run.completedAt,
		appUrl,
	});
	const event = payload.event;
	const rawBody = JSON.stringify(payload);
	const timestamp = Math.floor(Date.now() / 1_000);
	let dispatcher: Agent | undefined;
	try {
		const secret = decryptSecret(
			record.service.callbackSecretCiphertext,
			encryptionKey,
			`service:${record.service.id}:callback`,
		);
		const resolved = await resolveSafeCallbackUrl(record.service.callbackUrl);
		let addressIndex = 0;
		dispatcher = new Agent({
			connect: {
				lookup: (_hostname, _options, callback) => {
					const address = resolved.addresses[addressIndex++ % resolved.addresses.length];
					if (!address) return callback(new Error("No approved callback address"), "", 4);
					callback(null, address, address.includes(":") ? 6 : 4);
				},
			},
		});
		const response = await request(resolved.url, {
			method: "POST",
			dispatcher,
			body: rawBody,
			headers: {
				"content-type": "application/json",
				"x-legwork-event": event,
				"x-legwork-delivery": record.delivery.id,
				"x-legwork-timestamp": String(timestamp),
				"x-legwork-signature": signCallback(timestamp, rawBody, secret),
			},
			headersTimeout: 10_000,
			bodyTimeout: 10_000,
		});
		await response.body.dump();
		if (response.statusCode < 200 || response.statusCode >= 300)
			throw new Error(`Callback returned ${response.statusCode}`);
		callbackAttempts.inc({ result: "delivered" });
		await db
			.update(callbackDeliveries)
			.set({
				status: "delivered",
				deliveredAt: new Date(),
				responseStatus: response.statusCode,
				updatedAt: new Date(),
			})
			.where(eq(callbackDeliveries.id, deliveryId));
	} catch (error) {
		callbackAttempts.inc({ result: "failed" });
		const nextAttempt = record.delivery.attempt + 1;
		const delay = retryDelays[record.delivery.attempt];
		await db
			.update(callbackDeliveries)
			.set({
				attempt: nextAttempt,
				status: delay ? "retrying" : "permanently_failed",
				error: error instanceof Error ? error.message.slice(0, 2_000) : "Callback failed",
				nextAttemptAt: delay ? new Date(Date.now() + delay * 1_000) : null,
				updatedAt: new Date(),
			})
			.where(eq(callbackDeliveries.id, deliveryId));
		if (delay) throw new CallbackRetryError("Callback delivery failed", delay);
	} finally {
		await dispatcher?.close();
	}
}
