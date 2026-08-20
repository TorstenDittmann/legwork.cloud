import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { and, desc, eq } from 'drizzle-orm';
import {
	auditEvents,
	createDatabase,
	notificationChannels,
	notificationChannelServices,
	notificationDeliveries,
	organizations,
	services
} from '@legwork/db';
import { actions, load } from './+page.server';

const db = createDatabase(`/tmp/legwork-notifications-actions-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_admin' }, organizationId: 'org_channels', role: 'admin' }
} as never;

let organizationId = '';
let serviceId = '';

function form(entries: Record<string, string | string[]>): Request {
	const data = new FormData();
	for (const [name, value] of Object.entries(entries))
		for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
	return new Request('http://localhost/notifications', { method: 'POST', body: data });
}

async function latestAudit(action: string) {
	const [row] = await db
		.select()
		.from(auditEvents)
		.where(and(eq(auditEvents.organizationId, organizationId), eq(auditEvents.action, action)))
		.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
		.limit(1);
	return row ?? null;
}

beforeAll(async () => {
	process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../packages/db/migrations', import.meta.url).pathname
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_channels', name: 'C', slug: 'c' })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: 'API', slug: 'api' })
		.returning();
	organizationId = organization!.id;
	serviceId = service!.id;
});

describe('notification channel actions', () => {
	it('creates a channel and records who did it', async () => {
		const result = await actions.createChannel({
			locals,
			request: form({
				kind: 'slack',
				name: 'On-call room',
				destination: 'https://hooks.slack.com/services/T123/B123/secret',
				serviceIds: [serviceId],
				events: ['analysis.completed']
			})
		} as never);
		expect(result).toMatchObject({ tone: 'success' });
		const [channel] = await db
			.select()
			.from(notificationChannels)
			.where(eq(notificationChannels.organizationId, organizationId));
		expect(channel?.name).toBe('On-call room');
		const audit = await latestAudit('notification_channel.created');
		expect(audit).toMatchObject({ actorId: 'user_admin', targetId: channel!.id });
	});

	it('edits a channel in place without re-pasting the webhook', async () => {
		const [channel] = await db
			.select()
			.from(notificationChannels)
			.where(eq(notificationChannels.organizationId, organizationId));
		const before = channel!.destinationCiphertext;
		const result = await actions.updateChannel({
			locals,
			request: form({
				channelId: channel!.id,
				name: 'Escalations',
				serviceIds: [],
				events: ['analysis.failed']
			})
		} as never);
		expect(result).toMatchObject({ tone: 'success' });
		const [updated] = await db
			.select()
			.from(notificationChannels)
			.where(eq(notificationChannels.id, channel!.id));
		expect(updated?.name).toBe('Escalations');
		expect(updated?.events).toEqual(['analysis.failed']);
		expect(updated?.destinationCiphertext).toBe(before);
		expect(
			await db
				.select()
				.from(notificationChannelServices)
				.where(eq(notificationChannelServices.channelId, channel!.id))
		).toEqual([]);
		const audit = await latestAudit('notification_channel.updated');
		expect(audit).toMatchObject({ actorId: 'user_admin', targetId: channel!.id });
	});

	it('surfaces per-channel delivery health including permanent failures', async () => {
		const [channel] = await db
			.select()
			.from(notificationChannels)
			.where(eq(notificationChannels.organizationId, organizationId));
		const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
		await db.insert(notificationDeliveries).values([
			{
				organizationId,
				channelId: channel!.id,
				event: 'analysis.completed',
				status: 'permanently_failed',
				error: 'Destination rejected the message (410)',
				responseStatus: 410,
				expiresAt,
				createdAt: new Date(Date.now() - 60_000)
			},
			{
				organizationId,
				channelId: channel!.id,
				event: 'notification.test',
				status: 'delivered',
				responseStatus: 200,
				expiresAt,
				createdAt: new Date()
			}
		]);
		const data = (await load({
			locals,
			url: new URL('http://localhost/notifications')
		} as never)) as Exclude<Awaited<ReturnType<typeof load>>, void>;
		const row = data.channels.find((entry: { id: string }) => entry.id === channel!.id);
		expect(row?.health.permanentlyFailed).toBe(1);
		expect(row?.health.lastDelivery).toMatchObject({ status: 'delivered', responseStatus: 200 });
	});
});
