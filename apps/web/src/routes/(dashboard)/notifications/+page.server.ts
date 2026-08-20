import { fail } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
	auditEvents,
	createDatabase,
	createTestNotificationDelivery,
	enqueueJob,
	notificationChannels,
	notificationChannelServices,
	notificationDeliveries,
	services
} from '@legwork/db';
import {
	notificationChannelKindSchema,
	notificationSubscriptionSchema,
	type CallbackEvent
} from '@legwork/contracts';
import { NotificationDestinationError, parseDestination } from '@legwork/notifications';
import { encryptSecret } from '@legwork/security';
import { requireEncryptionKey } from '$lib/server/config';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const createSchema = z.object({
	kind: notificationChannelKindSchema,
	name: z.string().trim().min(1).max(128),
	destination: z.string().trim().min(1).max(2_048),
	serviceIds: z.array(z.string().min(1))
});

const updateSchema = z.object({
	channelId: z.string().min(1),
	name: z.string().trim().min(1).max(128),
	// Empty keeps the stored webhook; operators should not have to re-paste a
	// secret to rename a channel or change its routing.
	destination: z.string().trim().max(2_048),
	serviceIds: z.array(z.string().min(1))
});

async function replaceServiceBindings(
	db: ReturnType<typeof createDatabase>,
	organizationId: string,
	channelId: string,
	serviceIds: string[]
): Promise<void> {
	await db
		.delete(notificationChannelServices)
		.where(
			and(
				eq(notificationChannelServices.organizationId, organizationId),
				eq(notificationChannelServices.channelId, channelId)
			)
		);
	if (serviceIds.length === 0) return;
	const owned = await db
		.select({ id: services.id })
		.from(services)
		.where(eq(services.organizationId, organizationId));
	const ownedIds = new Set(owned.map((service) => service.id));
	const rows = serviceIds
		.filter((serviceId) => ownedIds.has(serviceId))
		.map((serviceId) => ({ organizationId, channelId, serviceId }));
	if (rows.length > 0) await db.insert(notificationChannelServices).values(rows);
}

function channelAudit(
	organizationId: string,
	actorId: string,
	action: string,
	channelId: string,
	metadata: Record<string, string | number | boolean | null> = {}
) {
	return {
		organizationId,
		actorId,
		action,
		targetType: 'notification_channel',
		targetId: channelId,
		metadata
	};
}

/**
 * Parsed with the contracts-side schema rather than wrapped in a local `z.array`: the web app and
 * `@legwork/contracts` resolve different zod copies, which do not share types.
 */
function formEvents(formData: FormData): CallbackEvent[] {
	const parsed = notificationSubscriptionSchema.safeParse(formData.getAll('events').map(String));
	return parsed.success ? parsed.data : [];
}

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const db = createDatabase();
	const [channels, organizationServices, bindings, failedCounts, recentDeliveries] =
		await Promise.all([
			db
				.select()
				.from(notificationChannels)
				.where(eq(notificationChannels.organizationId, tenant.organizationId)),
			db
				.select({ id: services.id, name: services.name })
				.from(services)
				.where(eq(services.organizationId, tenant.organizationId)),
			db
				.select({
					channelId: notificationChannelServices.channelId,
					serviceId: notificationChannelServices.serviceId
				})
				.from(notificationChannelServices)
				.where(eq(notificationChannelServices.organizationId, tenant.organizationId)),
			db
				.select({ channelId: notificationDeliveries.channelId, value: count() })
				.from(notificationDeliveries)
				.where(
					and(
						eq(notificationDeliveries.organizationId, tenant.organizationId),
						eq(notificationDeliveries.status, 'permanently_failed')
					)
				)
				.groupBy(notificationDeliveries.channelId),
			db
				.select({
					channelId: notificationDeliveries.channelId,
					status: notificationDeliveries.status,
					event: notificationDeliveries.event,
					responseStatus: notificationDeliveries.responseStatus,
					error: notificationDeliveries.error,
					createdAt: notificationDeliveries.createdAt
				})
				.from(notificationDeliveries)
				.where(eq(notificationDeliveries.organizationId, tenant.organizationId))
				.orderBy(desc(notificationDeliveries.createdAt), desc(notificationDeliveries.id))
				.limit(200)
		]);
	const permanentlyFailedByChannel = new Map(
		failedCounts.map(({ channelId, value }) => [channelId, value])
	);
	const lastDeliveryByChannel = new Map<string, (typeof recentDeliveries)[number]>();
	for (const delivery of recentDeliveries)
		if (!lastDeliveryByChannel.has(delivery.channelId))
			lastDeliveryByChannel.set(delivery.channelId, delivery);
	return {
		title: 'Notifications',
		role: tenant.role,
		services: organizationServices,
		channels: channels.map((channel) => ({
			id: channel.id,
			kind: channel.kind,
			name: channel.name,
			destinationHint: channel.destinationHint,
			events: channel.events,
			enabled: channel.enabled,
			lastVerifiedAt: channel.lastVerifiedAt,
			lastVerificationError: channel.lastVerificationError,
			serviceIds: bindings
				.filter((binding) => binding.channelId === channel.id)
				.map((binding) => binding.serviceId),
			health: {
				permanentlyFailed: permanentlyFailedByChannel.get(channel.id) ?? 0,
				lastDelivery: lastDeliveryByChannel.get(channel.id) ?? null
			}
		}))
	};
};

export const actions: Actions = {
	createChannel: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const parsed = createSchema.safeParse({
			kind: formData.get('kind'),
			name: formData.get('name'),
			destination: formData.get('destination'),
			serviceIds: formData.getAll('serviceIds').map(String).filter(Boolean)
		});
		if (!parsed.success)
			return fail(400, {
				tone: 'danger',
				message: parsed.error.issues[0]?.message ?? 'Invalid channel'
			});
		const events = formEvents(formData);
		if (events.length === 0)
			return fail(400, { tone: 'danger', message: 'Select at least one event' });

		let destination: { destination: string; hint: string };
		try {
			destination = parseDestination(parsed.data.kind, parsed.data.destination);
		} catch (error) {
			return fail(400, {
				tone: 'danger',
				message:
					error instanceof NotificationDestinationError ? error.message : 'Invalid destination'
			});
		}

		const db = createDatabase();
		const id = crypto.randomUUID();
		await db.insert(notificationChannels).values({
			id,
			organizationId: tenant.organizationId,
			kind: parsed.data.kind,
			mode: parsed.data.kind === 'email' ? 'resend' : 'webhook',
			name: parsed.data.name,
			destinationCiphertext: encryptSecret(
				destination.destination,
				requireEncryptionKey(),
				`channel:${id}:destination`
			),
			destinationHint: destination.hint,
			events
		});
		await replaceServiceBindings(db, tenant.organizationId, id, parsed.data.serviceIds);
		await db.insert(auditEvents).values(
			channelAudit(tenant.organizationId, tenant.userId, 'notification_channel.created', id, {
				kind: parsed.data.kind,
				name: parsed.data.name
			})
		);
		return { tone: 'success' as const, message: 'Channel added. Send a test to confirm it works.' };
	},

	updateChannel: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const parsed = updateSchema.safeParse({
			channelId: formData.get('channelId'),
			name: formData.get('name'),
			destination: String(formData.get('destination') ?? ''),
			serviceIds: formData.getAll('serviceIds').map(String).filter(Boolean)
		});
		if (!parsed.success)
			return fail(400, {
				tone: 'danger',
				message: parsed.error.issues[0]?.message ?? 'Invalid channel'
			});
		const events = formEvents(formData);
		if (events.length === 0)
			return fail(400, { tone: 'danger', message: 'Select at least one event' });
		const db = createDatabase();
		const [channel] = await db
			.select()
			.from(notificationChannels)
			.where(
				and(
					eq(notificationChannels.id, parsed.data.channelId),
					eq(notificationChannels.organizationId, tenant.organizationId)
				)
			)
			.limit(1);
		if (!channel) return fail(404, { tone: 'danger', message: 'Channel not found' });
		let destinationUpdate: { destinationCiphertext: string; destinationHint: string } | null = null;
		if (parsed.data.destination.length > 0) {
			try {
				const destination = parseDestination(channel.kind, parsed.data.destination);
				destinationUpdate = {
					destinationCiphertext: encryptSecret(
						destination.destination,
						requireEncryptionKey(),
						`channel:${channel.id}:destination`
					),
					destinationHint: destination.hint
				};
			} catch (error) {
				return fail(400, {
					tone: 'danger',
					message:
						error instanceof NotificationDestinationError ? error.message : 'Invalid destination'
				});
			}
		}
		await db
			.update(notificationChannels)
			.set({
				name: parsed.data.name,
				events,
				...(destinationUpdate ?? {}),
				updatedAt: new Date()
			})
			.where(eq(notificationChannels.id, channel.id));
		await replaceServiceBindings(db, tenant.organizationId, channel.id, parsed.data.serviceIds);
		await db
			.insert(auditEvents)
			.values(
				channelAudit(
					tenant.organizationId,
					tenant.userId,
					'notification_channel.updated',
					channel.id,
					{ name: parsed.data.name, destinationChanged: destinationUpdate !== null }
				)
			);
		return { tone: 'success' as const, message: 'Channel updated' };
	},

	sendTest: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const channelId = String((await request.formData()).get('channelId') ?? '');
		const db = createDatabase();
		const [channel] = await db
			.select({ id: notificationChannels.id })
			.from(notificationChannels)
			.where(
				and(
					eq(notificationChannels.id, channelId),
					eq(notificationChannels.organizationId, tenant.organizationId)
				)
			)
			.limit(1);
		if (!channel) return fail(404, { tone: 'danger', message: 'Channel not found' });
		const delivery = await createTestNotificationDelivery(db, tenant.organizationId, channel.id);
		if (delivery)
			await enqueueJob(
				db,
				'deliver-notification',
				{ deliveryId: delivery.id },
				{ singletonKey: delivery.id, maxAttempts: 1 }
			);
		await db
			.insert(auditEvents)
			.values(
				channelAudit(tenant.organizationId, tenant.userId, 'notification_channel.tested', channelId)
			);
		return {
			tone: 'success' as const,
			message: 'Test queued. Refresh in a moment to see the result.'
		};
	},

	toggleChannel: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const channelId = String(formData.get('channelId') ?? '');
		const enabled = formData.get('enabled') === 'true';
		const db = createDatabase();
		await db
			.update(notificationChannels)
			.set({ enabled, updatedAt: new Date() })
			.where(
				and(
					eq(notificationChannels.id, channelId),
					eq(notificationChannels.organizationId, tenant.organizationId)
				)
			);
		await db.insert(auditEvents).values(
			channelAudit(
				tenant.organizationId,
				tenant.userId,
				'notification_channel.toggled',
				channelId,
				{
					enabled
				}
			)
		);
		return { tone: 'success' as const, message: enabled ? 'Channel enabled' : 'Channel paused' };
	},

	deleteChannel: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const channelId = String((await request.formData()).get('channelId') ?? '');
		const db = createDatabase();
		const removed = await db
			.delete(notificationChannels)
			.where(
				and(
					eq(notificationChannels.id, channelId),
					eq(notificationChannels.organizationId, tenant.organizationId)
				)
			)
			.returning({ name: notificationChannels.name });
		if (removed.length > 0)
			await db
				.insert(auditEvents)
				.values(
					channelAudit(
						tenant.organizationId,
						tenant.userId,
						'notification_channel.removed',
						channelId,
						{ name: removed[0]?.name ?? null }
					)
				);
		return { tone: 'success' as const, message: 'Channel removed' };
	}
};
