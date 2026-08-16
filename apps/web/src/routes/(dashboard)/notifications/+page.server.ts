import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
	createDatabase,
	createTestNotificationDelivery,
	enqueueJob,
	notificationChannels,
	notificationChannelServices,
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
	const [channels, organizationServices, bindings] = await Promise.all([
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
			.where(eq(notificationChannelServices.organizationId, tenant.organizationId))
	]);
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
				.map((binding) => binding.serviceId)
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
		if (parsed.data.serviceIds.length > 0) {
			const owned = await db
				.select({ id: services.id })
				.from(services)
				.where(eq(services.organizationId, tenant.organizationId));
			const ownedIds = new Set(owned.map((service) => service.id));
			const rows = parsed.data.serviceIds
				.filter((serviceId) => ownedIds.has(serviceId))
				.map((serviceId) => ({
					organizationId: tenant.organizationId,
					channelId: id,
					serviceId
				}));
			if (rows.length > 0) await db.insert(notificationChannelServices).values(rows);
		}
		return { tone: 'success' as const, message: 'Channel added. Send a test to confirm it works.' };
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
		return { tone: 'success' as const, message: enabled ? 'Channel enabled' : 'Channel paused' };
	},

	deleteChannel: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const channelId = String((await request.formData()).get('channelId') ?? '');
		const db = createDatabase();
		await db
			.delete(notificationChannels)
			.where(
				and(
					eq(notificationChannels.id, channelId),
					eq(notificationChannels.organizationId, tenant.organizationId)
				)
			);
		return { tone: 'success' as const, message: 'Channel removed' };
	}
};
