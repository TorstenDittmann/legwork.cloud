import { describe, expect, it } from "vitest";
import { matchChannels, type RoutableChannel } from "./routing";

function channel(overrides: Partial<RoutableChannel> = {}): RoutableChannel {
	return {
		id: "channel-1",
		enabled: true,
		events: ["analysis.completed", "analysis.inconclusive", "analysis.failed"],
		serviceIds: [],
		...overrides,
	};
}

describe("channel routing", () => {
	it("routes an unbound channel to every service", () => {
		const matched = matchChannels([channel()], "service-anything", "analysis.completed");
		expect(matched.map((entry) => entry.id)).toEqual(["channel-1"]);
	});

	it("routes a bound channel only to its own services", () => {
		const channels = [channel({ id: "payments", serviceIds: ["service-payments"] })];
		expect(matchChannels(channels, "service-payments", "analysis.completed")).toHaveLength(1);
		expect(matchChannels(channels, "service-search", "analysis.completed")).toHaveLength(0);
	});

	it("never routes to a disabled channel", () => {
		expect(matchChannels([channel({ enabled: false })], "service-1", "analysis.completed")).toEqual(
			[],
		);
	});

	it("respects the event subscription", () => {
		const channels = [channel({ events: ["analysis.completed"] })];
		expect(matchChannels(channels, "service-1", "analysis.completed")).toHaveLength(1);
		expect(matchChannels(channels, "service-1", "analysis.failed")).toHaveLength(0);
	});

	it("returns every channel that matches, not just the first", () => {
		const matched = matchChannels(
			[channel({ id: "all" }), channel({ id: "payments", serviceIds: ["service-payments"] })],
			"service-payments",
			"analysis.completed",
		);
		expect(matched.map((entry) => entry.id)).toEqual(["all", "payments"]);
	});
});
