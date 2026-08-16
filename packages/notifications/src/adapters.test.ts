import { describe, expect, it } from "vitest";
import type { Diagnosis } from "@legwork/contracts";
import { buildNotificationRequest } from "./adapters";
import { buildNotificationPayload } from "./payload";

const secretExcerpt = "const STRIPE_KEY = 'sk_live_do_not_leak'";
const email = { apiKey: "re_test_key", from: "Legwork <alerts@legwork.dev>" };

const diagnosis = {
	schemaVersion: "1",
	status: "diagnosed",
	title: "Retry loop exhausts the connection pool",
	summary: "The payments client retries without a ceiling.",
	rootCause: { statement: "Unbounded retry in the payments client", confidence: 0.82 },
	evidence: [
		{
			repositoryId: "repo-1",
			path: "src/payments/retry.ts",
			lineStart: 88,
			lineEnd: 104,
			excerpt: secretExcerpt,
			explanation: "The retry has no ceiling",
		},
	],
	suggestedFix: null,
	checksRun: [],
	limitations: [],
} as Diagnosis;

const payload = buildNotificationPayload({
	event: "analysis.completed",
	status: "completed",
	serviceName: "payments-api",
	incidentTitle: "5xx spike on /checkout",
	diagnosis,
	dashboardUrl: "https://app.legwork.dev/incidents/inc-1",
	completedAt: new Date("2026-08-16T10:00:00Z"),
});

describe("slack requests", () => {
	it("posts Block Kit to the webhook URL", () => {
		const request = buildNotificationRequest({
			kind: "slack",
			destination: "https://hooks.slack.com/services/T01/B02/tok",
			payload,
		});
		expect(request.url.toString()).toBe("https://hooks.slack.com/services/T01/B02/tok");
		expect(request.headers["content-type"]).toBe("application/json");
		const body = JSON.parse(request.body);
		expect(Array.isArray(body.blocks)).toBe(true);
		const text = JSON.stringify(body);
		expect(text).toContain("payments-api");
		expect(text).toContain("Unbounded retry in the payments client");
		expect(text).toContain("src/payments/retry.ts:88-104");
		expect(text).toContain("https://app.legwork.dev/incidents/inc-1");
	});
});

describe("discord requests", () => {
	it("posts an embed to the webhook URL", () => {
		const request = buildNotificationRequest({
			kind: "discord",
			destination: "https://discord.com/api/webhooks/123/tok",
			payload,
		});
		expect(request.url.toString()).toBe("https://discord.com/api/webhooks/123/tok");
		const body = JSON.parse(request.body);
		expect(body.embeds).toHaveLength(1);
		const text = JSON.stringify(body);
		expect(text).toContain("Unbounded retry in the payments client");
		expect(text).toContain("src/payments/retry.ts:88-104");
	});
});

describe("email requests", () => {
	it("posts to Resend with the api key and a subject naming the service", () => {
		const request = buildNotificationRequest({
			kind: "email",
			destination: "oncall@acme.com",
			payload,
			email,
		});
		expect(request.url.toString()).toBe("https://api.resend.com/emails");
		expect(request.headers.authorization).toBe("Bearer re_test_key");
		const body = JSON.parse(request.body);
		expect(body.to).toEqual(["oncall@acme.com"]);
		expect(body.from).toBe("Legwork <alerts@legwork.dev>");
		expect(body.subject).toContain("payments-api");
		expect(body.text).toContain("Unbounded retry in the payments client");
	});

	it("refuses to build without Resend configuration rather than sending unauthenticated", () => {
		expect(() =>
			buildNotificationRequest({ kind: "email", destination: "oncall@acme.com", payload }),
		).toThrow(/resend/i);
	});
});

describe("source privacy", () => {
	it("renders no evidence excerpt in any channel", () => {
		const rendered = [
			buildNotificationRequest({
				kind: "slack",
				destination: "https://hooks.slack.com/services/T01/B02/tok",
				payload,
			}),
			buildNotificationRequest({
				kind: "discord",
				destination: "https://discord.com/api/webhooks/123/tok",
				payload,
			}),
			buildNotificationRequest({
				kind: "email",
				destination: "oncall@acme.com",
				payload,
				email,
			}),
		];
		for (const request of rendered) expect(request.body).not.toContain("sk_live_do_not_leak");
	});
});
