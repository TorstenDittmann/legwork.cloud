import { describe, expect, it } from "vitest";
import { buildCallbackPayload } from "./callbacks";

describe("buildCallbackPayload", () => {
	it("derives the event from the run status", () => {
		const payload = buildCallbackPayload({
			runStatus: "inconclusive",
			incidentId: "inc-1",
			runId: "run-1",
			summary: null,
			confidence: null,
			completedAt: new Date("2026-08-16T10:00:00Z"),
			appUrl: "https://app.legwork.dev",
		});
		expect(payload.event).toBe("analysis.inconclusive");
		expect(payload.status).toBe("inconclusive");
		expect(payload.dashboardUrl).toBe("https://app.legwork.dev/incidents/inc-1");
		expect(payload.completedAt).toBe("2026-08-16T10:00:00.000Z");
	});

	it("redacts secrets the model quoted into the outbound summary", () => {
		const payload = buildCallbackPayload({
			runStatus: "completed",
			incidentId: "inc-1",
			runId: "run-1",
			summary: "Rotate sk_live_4eC39HqLyjWDarjtT1zdp7dc immediately.",
			confidence: 0.8,
			completedAt: new Date("2026-08-16T10:00:00Z"),
			appUrl: "https://app.legwork.dev",
		});
		expect(JSON.stringify(payload)).not.toContain("sk_live_4eC39HqLyjWDarjtT1zdp7dc");
	});
});
