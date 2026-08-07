import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createIncidentRequestSchema } from "@oncall-ai/contracts";
import {
	alertIntegrations,
	createDatabase,
	createIncidentIdempotently,
	externalIncidentLinks,
	integrationDeliveries,
} from "@oncall-ai/db";
import {
	alertProviderAdapters,
	IntegrationError,
	MAX_WEBHOOK_BYTES,
} from "@oncall-ai/integrations";
import { decryptSecret } from "@oncall-ai/security";
import { HttpProblem, problemResponse, readLimitedBytes } from "@/lib/http";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
function episodeKey(provider: string, integrationId: string, groupKey: string, startedAt: string) {
	return createHash("sha256")
		.update(provider)
		.update(integrationId)
		.update(groupKey)
		.update(startedAt)
		.digest("hex");
}

export async function POST(
	request: Request,
	context: { params: Promise<{ integrationId: string }> },
) {
	try {
		if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
			throw new HttpProblem(415, "Unsupported Media Type", "Webhook body must be JSON");
		const { integrationId } = await context.params;
		const db = createDatabase();
		const [integration] = await db
			.select()
			.from(alertIntegrations)
			.where(eq(alertIntegrations.id, integrationId))
			.limit(1);
		if (!integration || !integration.enabled)
			throw new HttpProblem(404, "Integration Unavailable", "Integration is unavailable");
		const rawBody = await readLimitedBytes(request, MAX_WEBHOOK_BYTES);
		const encryptionKey = process.env.DATA_ENCRYPTION_KEY;
		if (!encryptionKey) throw new Error("DATA_ENCRYPTION_KEY is required");
		const secret = decryptSecret(
			integration.webhookSecretCiphertext,
			encryptionKey,
			`alert-integration:${integration.id}:webhook-secret`,
		);
		const event = await alertProviderAdapters[integration.provider].verifyAndNormalize({
			headers: request.headers,
			rawBody,
			secret,
			now: new Date(),
		});
		const now = new Date();
		const expiresAt = new Date(now.getTime() + RETENTION_MS);
		const payloadHash = createHash("sha256").update(rawBody).digest("hex");
		const providerDeliveryId =
			request.headers.get("sentry-hook-id") ?? request.headers.get("x-grafana-delivery-id");
		const [delivery] = await db
			.insert(integrationDeliveries)
			.values({
				organizationId: integration.organizationId,
				integrationId: integration.id,
				payloadHash,
				providerDeliveryId,
				eventType: event.eventType,
				status: "accepted",
				receivedAt: now,
				expiresAt,
			})
			.onConflictDoNothing()
			.returning({ id: integrationDeliveries.id });
		if (!delivery) return NextResponse.json({ status: "duplicate" }, { status: 202 });
		await db
			.update(alertIntegrations)
			.set({ lastReceivedAt: now, updatedAt: now })
			.where(
				and(
					eq(alertIntegrations.id, integration.id),
					eq(alertIntegrations.organizationId, integration.organizationId),
				),
			);
		const [active] = await db
			.select()
			.from(externalIncidentLinks)
			.where(
				and(
					eq(externalIncidentLinks.integrationId, integration.id),
					eq(externalIncidentLinks.externalGroupKey, event.groupKey),
					eq(externalIncidentLinks.state, "firing"),
				),
			)
			.orderBy(desc(externalIncidentLinks.startedAt))
			.limit(1);
		if (event.eventType === "resolved") {
			if (active)
				await db
					.update(externalIncidentLinks)
					.set({
						state: "resolved",
						resolvedAt: event.endedAt ? new Date(event.endedAt) : now,
						lastSeenAt: now,
						notificationCount: active.notificationCount + 1,
						providerContext: event,
						updatedAt: now,
					})
					.where(eq(externalIncidentLinks.id, active.id));
			return NextResponse.json({ status: "accepted" }, { status: 202 });
		}
		if (active) {
			await db
				.update(externalIncidentLinks)
				.set({
					lastSeenAt: now,
					notificationCount: active.notificationCount + 1,
					providerContext: event,
					updatedAt: now,
				})
				.where(eq(externalIncidentLinks.id, active.id));
			return NextResponse.json(
				{ status: "accepted", incidentId: active.incidentId },
				{ status: 202 },
			);
		}
		const key = episodeKey(event.provider, integration.id, event.groupKey, event.episodeStartedAt);
		const payload = createIncidentRequestSchema.parse({
			externalId: `${event.provider}:${event.groupKey}`,
			title: event.title,
			description: event.description,
			severity: event.severity,
			occurredAt: event.episodeStartedAt,
			environment: event.environment,
			primaryCommitSha: event.primaryCommitSha,
			context: { provider: event.provider, providerEpisodeKey: key, ...event.context },
		});
		const created = await createIncidentIdempotently(db, {
			organizationId: integration.organizationId,
			serviceId: integration.serviceId,
			idempotencyKey: key,
			payload,
			now,
		});
		await db
			.insert(externalIncidentLinks)
			.values({
				organizationId: integration.organizationId,
				integrationId: integration.id,
				incidentId: created.incidentId,
				provider: event.provider,
				externalGroupKey: event.groupKey,
				episodeKey: key,
				state: event.eventType,
				startedAt: new Date(event.episodeStartedAt),
				lastSeenAt: now,
				notificationCount: 1,
				providerContext: event,
				expiresAt,
			})
			.onConflictDoNothing();
		return NextResponse.json(
			{ status: "accepted", incidentId: created.incidentId, runId: created.runId },
			{ status: 202 },
		);
	} catch (error) {
		if (error instanceof IntegrationError)
			return problemResponse(
				new HttpProblem(
					error.code === "INTEGRATION_SIGNATURE_INVALID" ? 401 : 422,
					"Webhook Rejected",
					error.code,
				),
			);
		return problemResponse(error);
	}
}
