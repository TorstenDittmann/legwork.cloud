import { describe, expect, it } from "vitest";
import { classifyResponse, classifyTransportError, NOTIFICATION_RETRY_DELAYS } from "./delivery";

describe("successful delivery", () => {
	it("treats any 2xx as delivered", () => {
		expect(classifyResponse(200, 0).kind).toBe("delivered");
		expect(classifyResponse(204, 0).kind).toBe("delivered");
	});
});

describe("rate limiting", () => {
	it("waits exactly as long as the provider asks", () => {
		expect(classifyResponse(429, 0, "12")).toMatchObject({ kind: "retry", delaySeconds: 12 });
	});
	it("clamps an absurd Retry-After so a job cannot be parked", () => {
		expect(classifyResponse(429, 0, "99999")).toMatchObject({ kind: "retry", delaySeconds: 900 });
	});
	it("falls back to the ladder when Retry-After is missing or unparseable", () => {
		expect(classifyResponse(429, 0, null)).toMatchObject({ kind: "retry", delaySeconds: 30 });
		expect(classifyResponse(429, 1, "soon")).toMatchObject({ kind: "retry", delaySeconds: 120 });
	});
});

describe("client errors", () => {
	it("fails permanently on the first attempt for a deleted webhook", () => {
		expect(classifyResponse(404, 0)).toMatchObject({ kind: "permanent" });
		expect(classifyResponse(403, 0)).toMatchObject({ kind: "permanent" });
		expect(classifyResponse(400, 0)).toMatchObject({ kind: "permanent" });
	});

	it("retries a request timeout, which is transient rather than a revoked webhook", () => {
		expect(classifyResponse(408, 0)).toMatchObject({ kind: "retry", delaySeconds: 30 });
		expect(classifyResponse(408, 3)).toMatchObject({ kind: "permanent" });
	});
});

describe("server errors", () => {
	it("walks the ladder and then gives up", () => {
		expect(classifyResponse(500, 0)).toMatchObject({ kind: "retry", delaySeconds: 30 });
		expect(classifyResponse(500, 1)).toMatchObject({ kind: "retry", delaySeconds: 120 });
		expect(classifyResponse(502, 2)).toMatchObject({ kind: "retry", delaySeconds: 600 });
		expect(classifyResponse(500, 3)).toMatchObject({ kind: "permanent" });
	});
	it("uses a ladder short enough that a late notification is not noise", () => {
		expect(NOTIFICATION_RETRY_DELAYS).toEqual([30, 120, 600]);
	});
});

describe("transport errors", () => {
	it("retries on the ladder and gives up at exhaustion", () => {
		expect(classifyTransportError(new Error("socket hang up"), 0)).toMatchObject({
			kind: "retry",
			delaySeconds: 30,
		});
		expect(classifyTransportError(new Error("socket hang up"), 3)).toMatchObject({
			kind: "permanent",
		});
	});
});
