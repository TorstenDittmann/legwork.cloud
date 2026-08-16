import { and, eq, inArray } from "drizzle-orm";
import type { CallbackEvent } from "@legwork/contracts";
import type { Database } from "./client";
import {
	notificationChannels,
	notificationChannelServices,
	notificationDeliveries,
} from "./schema";

export interface ResolvedNotificationChannel {
	id: string;
	kind: (typeof notificationChannels.$inferSelect)["kind"];
	mode: (typeof notificationChannels.$inferSelect)["mode"];
	name: string;
	destinationCiphertext: string;
	enabled: boolean;
	events: CallbackEvent[];
	/** Empty means every service in the organization; entries narrow it. */
	serviceIds: string[];
}

export interface NotificationDeliveryInsert {
	organizationId: string;
	channelId: string;
	runId: string;
	event: CallbackEvent;
	expiresAt: Date;
}

/** Loads every enabled channel for an organization with the services each one is bound to. */
export async function listRoutableChannels(
	db: Database,
	organizationId: string,
): Promise<ResolvedNotificationChannel[]> {
	const channels = await db
		.select()
		.from(notificationChannels)
		.where(
			and(
				eq(notificationChannels.organizationId, organizationId),
				eq(notificationChannels.enabled, true),
			),
		);
	if (channels.length === 0) return [];
	const bindings = await db
		.select({
			channelId: notificationChannelServices.channelId,
			serviceId: notificationChannelServices.serviceId,
		})
		.from(notificationChannelServices)
		.where(
			and(
				eq(notificationChannelServices.organizationId, organizationId),
				inArray(
					notificationChannelServices.channelId,
					channels.map((channel) => channel.id),
				),
			),
		);
	return channels.map((channel) => ({
		id: channel.id,
		kind: channel.kind,
		mode: channel.mode,
		name: channel.name,
		destinationCiphertext: channel.destinationCiphertext,
		enabled: channel.enabled,
		events: channel.events,
		serviceIds: bindings
			.filter((binding) => binding.channelId === channel.id)
			.map((binding) => binding.serviceId),
	}));
}

/**
 * The partial unique index on `(channel_id, run_id)` makes a repeated insert a no-op, so
 * re-running the enqueue after a worker crash cannot double-notify.
 */
export async function insertNotificationDeliveries(
	db: Database,
	rows: NotificationDeliveryInsert[],
): Promise<Array<{ id: string }>> {
	if (rows.length === 0) return [];
	return db
		.insert(notificationDeliveries)
		.values(rows)
		.onConflictDoNothing()
		.returning({ id: notificationDeliveries.id });
}
