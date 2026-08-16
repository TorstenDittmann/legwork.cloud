import type { CallbackEvent } from "@legwork/contracts";

export interface RoutableChannel {
	id: string;
	enabled: boolean;
	events: CallbackEvent[];
	/** Empty means every service in the organization; entries narrow it. */
	serviceIds: string[];
}

export function matchChannels<T extends RoutableChannel>(
	channels: T[],
	serviceId: string,
	event: CallbackEvent,
): T[] {
	return channels.filter(
		(channel) =>
			channel.enabled &&
			channel.events.includes(event) &&
			(channel.serviceIds.length === 0 || channel.serviceIds.includes(serviceId)),
	);
}
