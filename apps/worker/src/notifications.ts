import { and, eq, inArray } from "drizzle-orm";
import { Agent, request } from "undici";
import type { CallbackEvent } from "@legwork/contracts";
import {
	analysisRuns,
	createDatabase,
	diagnoses,
	enqueueJob,
	incidents,
	insertNotificationDeliveries,
	listRoutableChannels,
	notificationChannels,
	notificationDeliveries,
	services,
} from "@legwork/db";
import { logger } from "@legwork/observability";
import {
	buildNotificationPayload,
	buildNotificationRequest,
	buildTestPayload,
	classifyResponse,
	classifyTransportError,
	matchChannels,
	type DeliveryOutcome,
} from "@legwork/notifications";
import { decryptSecret, resolveSafeCallbackUrl } from "@legwork/security";

export class NotificationRetryError extends Error {
	constructor(
		message: string,
		readonly delaySeconds: number,
	) {
		super(message);
	}
}

export interface NotificationDeliveryConfig {
	appUrl: string;
	encryptionKey: string;
	resendApiKey: string;
	resendFromAddress: string;
}

function eventFor(status: string): CallbackEvent {
	if (status === "completed") return "analysis.completed";
	return status === "inconclusive" ? "analysis.inconclusive" : "analysis.failed";
}

/** Fans a finished run out to every channel routed to its service. */
export async function enqueueNotifications(runId: string): Promise<void> {
	const db = createDatabase();
	const [record] = await db
		.select({ run: analysisRuns, incident: incidents })
		.from(analysisRuns)
		.innerJoin(incidents, eq(incidents.id, analysisRuns.incidentId))
		.where(eq(analysisRuns.id, runId))
		.limit(1);
	if (!record || !["completed", "inconclusive", "failed"].includes(record.run.status)) return;

	const event = eventFor(record.run.status);
	const channels = await listRoutableChannels(db, record.run.organizationId);
	const matched = matchChannels(channels, record.incident.serviceId, event);
	if (matched.length === 0) return;

	const created = await insertNotificationDeliveries(
		db,
		matched.map((channel) => ({
			organizationId: record.run.organizationId,
			channelId: channel.id,
			runId,
			event,
			expiresAt: record.run.expiresAt,
		})),
	);
	for (const delivery of created)
		await enqueueJob(
			db,
			"deliver-notification",
			{ deliveryId: delivery.id },
			{ singletonKey: delivery.id, maxAttempts: 4 },
		);
}

/** Queues an operator-triggered test message. The delivery carries no run. */
export async function enqueueTestNotification(
	organizationId: string,
	channelId: string,
): Promise<void> {
	const db = createDatabase();
	const [delivery] = await db
		.insert(notificationDeliveries)
		.values({
			organizationId,
			channelId,
			event: "notification.test",
			expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
		})
		.returning({ id: notificationDeliveries.id });
	if (delivery)
		await enqueueJob(
			db,
			"deliver-notification",
			{ deliveryId: delivery.id },
			{ singletonKey: delivery.id, maxAttempts: 1 },
		);
}

async function recordOutcome(
	deliveryId: string,
	channelId: string,
	outcome: DeliveryOutcome,
): Promise<void> {
	const db = createDatabase();
	const now = new Date();
	if (outcome.kind === "delivered") {
		await db
			.update(notificationDeliveries)
			.set({
				status: "delivered",
				deliveredAt: now,
				responseStatus: outcome.status,
				error: null,
				nextAttemptAt: null,
				updatedAt: now,
			})
			.where(eq(notificationDeliveries.id, deliveryId));
		await db
			.update(notificationChannels)
			.set({ lastVerifiedAt: now, lastVerificationError: null, updatedAt: now })
			.where(eq(notificationChannels.id, channelId));
		return;
	}
	await db
		.update(notificationDeliveries)
		.set({
			status: outcome.kind === "retry" ? "retrying" : "permanently_failed",
			responseStatus: outcome.status ?? null,
			error: outcome.error.slice(0, 2_000),
			nextAttemptAt:
				outcome.kind === "retry" ? new Date(Date.now() + outcome.delaySeconds * 1_000) : null,
			updatedAt: now,
		})
		.where(eq(notificationDeliveries.id, deliveryId));
	await db
		.update(notificationChannels)
		.set({ lastVerificationError: outcome.error.slice(0, 2_000), updatedAt: now })
		.where(eq(notificationChannels.id, channelId));
}

export async function deliverNotification(
	deliveryId: string,
	config: NotificationDeliveryConfig,
): Promise<void> {
	const db = createDatabase();
	const [record] = await db
		.select({
			delivery: notificationDeliveries,
			channel: notificationChannels,
			run: analysisRuns,
			incident: incidents,
			service: services,
			diagnosis: diagnoses.diagnosis,
		})
		.from(notificationDeliveries)
		.innerJoin(
			notificationChannels,
			and(
				eq(notificationChannels.id, notificationDeliveries.channelId),
				eq(notificationChannels.organizationId, notificationDeliveries.organizationId),
			),
		)
		.leftJoin(analysisRuns, eq(analysisRuns.id, notificationDeliveries.runId))
		.leftJoin(incidents, eq(incidents.id, analysisRuns.incidentId))
		.leftJoin(services, eq(services.id, incidents.serviceId))
		.leftJoin(diagnoses, eq(diagnoses.runId, analysisRuns.id))
		.where(eq(notificationDeliveries.id, deliveryId))
		.limit(1);
	if (!record || record.delivery.status === "delivered") return;

	const attempt = record.delivery.attempt;
	const payload =
		record.delivery.event === "notification.test" || !record.run
			? buildTestPayload(config.appUrl)
			: buildNotificationPayload({
					event: eventFor(record.run.status),
					status: record.run.status as "completed" | "inconclusive" | "failed",
					serviceName: record.service?.name ?? "Unknown service",
					incidentTitle: record.incident?.title ?? "Incident",
					diagnosis: record.diagnosis ?? null,
					dashboardUrl: `${config.appUrl}/incidents/${record.incident?.id ?? ""}`,
					completedAt: record.run.completedAt ?? new Date(),
				});

	let dispatcher: Agent | undefined;
	let outcome: DeliveryOutcome;
	try {
		const destination = decryptSecret(
			record.channel.destinationCiphertext,
			config.encryptionKey,
			`channel:${record.channel.id}:destination`,
		);
		const built = buildNotificationRequest({
			kind: record.channel.kind,
			destination,
			payload,
			...(record.channel.kind === "email"
				? { email: { apiKey: config.resendApiKey, from: config.resendFromAddress } }
				: {}),
		});
		// The host is already allowlisted at save time; pin the address as defense in depth.
		const resolved = await resolveSafeCallbackUrl(built.url.toString());
		let addressIndex = 0;
		dispatcher = new Agent({
			connect: {
				lookup: (_hostname, _options, callback) => {
					const address = resolved.addresses[addressIndex++ % resolved.addresses.length];
					if (!address) return callback(new Error("No approved address"), "", 4);
					callback(null, address, address.includes(":") ? 6 : 4);
				},
			},
		});
		const response = await request(resolved.url, {
			method: "POST",
			dispatcher,
			body: built.body,
			headers: built.headers,
			headersTimeout: 10_000,
			bodyTimeout: 10_000,
		});
		const retryAfter = response.headers["retry-after"];
		await response.body.dump();
		outcome = classifyResponse(
			response.statusCode,
			attempt,
			Array.isArray(retryAfter) ? retryAfter[0] : retryAfter,
		);
	} catch (error) {
		outcome = classifyTransportError(error, attempt);
	} finally {
		await dispatcher?.close();
	}

	await db
		.update(notificationDeliveries)
		.set({ attempt: attempt + 1 })
		.where(eq(notificationDeliveries.id, deliveryId));
	await recordOutcome(deliveryId, record.channel.id, outcome);
	if (outcome.kind === "retry")
		throw new NotificationRetryError(outcome.error, outcome.delaySeconds);
	if (outcome.kind === "permanent")
		logger.warn(
			{ deliveryId, channelId: record.channel.id, error: outcome.error },
			"notification permanently failed",
		);
}

/** Marks any deliveries for a channel as stopped when the channel is deleted mid-flight. */
export async function cancelPendingNotifications(channelId: string): Promise<void> {
	const db = createDatabase();
	await db
		.update(notificationDeliveries)
		.set({ status: "permanently_failed", error: "Channel removed", updatedAt: new Date() })
		.where(
			and(
				eq(notificationDeliveries.channelId, channelId),
				inArray(notificationDeliveries.status, ["pending", "retrying"]),
			),
		);
}
