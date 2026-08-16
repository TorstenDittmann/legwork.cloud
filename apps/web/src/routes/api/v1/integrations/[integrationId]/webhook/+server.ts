import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { createIncidentRequestSchema } from '@legwork/contracts';
import {
	alertIntegrations,
	createDatabase,
	createIncidentIdempotently,
	externalIncidentLinks,
	integrationDeliveries
} from '@legwork/db';
import { alertProviderAdapters, IntegrationError, MAX_WEBHOOK_BYTES } from '@legwork/integrations';
import { decryptSecret } from '@legwork/security';
import { requireEncryptionKey } from '$lib/server/config';
import { HttpProblem, problemResponse, readLimitedBytes } from '$lib/server/http';
import type { RequestHandler } from './$types';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
function episodeKey(provider: string, integrationId: string, groupKey: string, startedAt: string) {
	return createHash('sha256')
		.update(provider)
		.update(integrationId)
		.update(groupKey)
		.update(startedAt)
		.digest('hex');
}

export const POST: RequestHandler = async (event) => {
	try {
		const request = event.request;
		if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
			throw new HttpProblem(415, 'Unsupported Media Type', 'Webhook body must be JSON');
		const { integrationId } = event.params;
		const db = createDatabase();
		const [integration] = await db
			.select()
			.from(alertIntegrations)
			.where(eq(alertIntegrations.id, integrationId))
			.limit(1);
		if (!integration || !integration.enabled)
			throw new HttpProblem(404, 'Integration Unavailable', 'Integration is unavailable');
		const rawBody = await readLimitedBytes(request, MAX_WEBHOOK_BYTES);
		const encryptionKey = requireEncryptionKey();
		const secret = decryptSecret(
			integration.webhookSecretCiphertext,
			encryptionKey,
			`alert-integration:${integration.id}:webhook-secret`
		);
		const event_ = await alertProviderAdapters[integration.provider].verifyAndNormalize({
			headers: request.headers,
			rawBody,
			secret,
			now: new Date()
		});
		const now = new Date();
		const expiresAt = new Date(now.getTime() + RETENTION_MS);
		const payloadHash = createHash('sha256').update(rawBody).digest('hex');
		const providerDeliveryId =
			request.headers.get('sentry-hook-id') ?? request.headers.get('x-grafana-delivery-id');
		const [delivery] = await db
			.insert(integrationDeliveries)
			.values({
				organizationId: integration.organizationId,
				integrationId: integration.id,
				payloadHash,
				providerDeliveryId,
				eventType: event_.eventType,
				status: 'accepted',
				receivedAt: now,
				expiresAt
			})
			.onConflictDoNothing()
			.returning({ id: integrationDeliveries.id });
		if (!delivery) return json({ status: 'duplicate' }, { status: 202 });
		await db
			.update(alertIntegrations)
			.set({ lastReceivedAt: now, updatedAt: now })
			.where(
				and(
					eq(alertIntegrations.id, integration.id),
					eq(alertIntegrations.organizationId, integration.organizationId)
				)
			);
		const [active] = await db
			.select()
			.from(externalIncidentLinks)
			.where(
				and(
					eq(externalIncidentLinks.integrationId, integration.id),
					eq(externalIncidentLinks.externalGroupKey, event_.groupKey),
					eq(externalIncidentLinks.state, 'firing')
				)
			)
			.orderBy(desc(externalIncidentLinks.startedAt))
			.limit(1);
		if (event_.eventType === 'resolved') {
			if (active)
				await db
					.update(externalIncidentLinks)
					.set({
						state: 'resolved',
						resolvedAt: event_.endedAt ? new Date(event_.endedAt) : now,
						lastSeenAt: now,
						notificationCount: active.notificationCount + 1,
						providerContext: event_,
						updatedAt: now
					})
					.where(eq(externalIncidentLinks.id, active.id));
			return json({ status: 'accepted' }, { status: 202 });
		}
		if (active) {
			await db
				.update(externalIncidentLinks)
				.set({
					lastSeenAt: now,
					notificationCount: active.notificationCount + 1,
					providerContext: event_,
					updatedAt: now
				})
				.where(eq(externalIncidentLinks.id, active.id));
			return json({ status: 'accepted', incidentId: active.incidentId }, { status: 202 });
		}
		const key = episodeKey(
			event_.provider,
			integration.id,
			event_.groupKey,
			event_.episodeStartedAt
		);
		const payload = createIncidentRequestSchema.parse({
			externalId: `${event_.provider}:${event_.groupKey}`,
			title: event_.title,
			description: event_.description,
			severity: event_.severity,
			occurredAt: event_.episodeStartedAt,
			environment: event_.environment,
			primaryCommitSha: event_.primaryCommitSha,
			context: { provider: event_.provider, providerEpisodeKey: key, ...event_.context }
		});
		const created = await createIncidentIdempotently(db, {
			organizationId: integration.organizationId,
			serviceId: integration.serviceId,
			idempotencyKey: key,
			payload,
			now
		});
		await db
			.insert(externalIncidentLinks)
			.values({
				organizationId: integration.organizationId,
				integrationId: integration.id,
				incidentId: created.incidentId,
				provider: event_.provider,
				externalGroupKey: event_.groupKey,
				episodeKey: key,
				state: event_.eventType,
				startedAt: new Date(event_.episodeStartedAt),
				lastSeenAt: now,
				notificationCount: 1,
				providerContext: event_,
				expiresAt
			})
			.onConflictDoNothing();
		return json(
			{ status: 'accepted', incidentId: created.incidentId, runId: created.runId },
			{ status: 202 }
		);
	} catch (error) {
		if (error instanceof IntegrationError)
			return problemResponse(
				new HttpProblem(
					error.code === 'INTEGRATION_SIGNATURE_INVALID' ? 401 : 422,
					'Webhook Rejected',
					error.code
				)
			);
		return problemResponse(error);
	}
};
