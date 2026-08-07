import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { grafanaAlertAdapter, sentryAlertAdapter } from "./adapters";

const secret = "test-secret";
function signed(body: unknown, header: string) {
	const rawBody = new TextEncoder().encode(JSON.stringify(body));
	return {
		rawBody,
		headers: new Headers({
			"content-type": "application/json",
			[header]: createHmac("sha256", secret).update(rawBody).digest("hex"),
		}),
		secret,
		now: new Date("2026-01-01T00:00:00Z"),
	};
}
describe("provider alert adapters", () => {
	it("verifies and groups native Grafana alerts", async () => {
		const event = await grafanaAlertAdapter.verifyAndNormalize(
			signed(
				{
					status: "firing",
					groupKey: "group-1",
					commonLabels: { severity: "critical", environment: "prod" },
					commonAnnotations: { summary: "API down" },
					alerts: [
						{
							status: "firing",
							labels: { service: "api" },
							annotations: {},
							startsAt: "2026-01-01T00:00:00Z",
							fingerprint: "fp-1",
						},
						{
							status: "firing",
							labels: {},
							annotations: {},
							startsAt: "2026-01-01T00:01:00Z",
							fingerprint: "fp-2",
						},
					],
				},
				"x-grafana-alerting-signature",
			),
		);
		expect(event).toMatchObject({
			provider: "grafana",
			groupKey: "group-1",
			severity: "critical",
			environment: "prod",
		});
		expect(event.children).toHaveLength(2);
	});
	it("rejects a bad signature before accepting JSON", async () => {
		await expect(
			grafanaAlertAdapter.verifyAndNormalize({
				rawBody: new TextEncoder().encode("not-json"),
				headers: new Headers({ "x-grafana-alerting-signature": "00" }),
				secret,
				now: new Date(),
			}),
		).rejects.toMatchObject({ code: "INTEGRATION_SIGNATURE_INVALID" });
	});
	it("normalizes a signed Sentry issue", async () => {
		const input = signed(
			{
				action: "triggered",
				data: {
					issue: {
						id: "42",
						shortId: "API-1",
						title: "TypeError",
						level: "error",
						project: { slug: "api" },
					},
					event: {
						eventID: "a".repeat(32),
						dateCreated: "2026-01-01T00:00:00Z",
						environment: "production",
						tags: [["release", "1.2.3"]],
					},
				},
			},
			"sentry-hook-signature",
		);
		input.headers.set("sentry-hook-resource", "issue");
		await expect(sentryAlertAdapter.verifyAndNormalize(input)).resolves.toMatchObject({
			provider: "sentry",
			groupKey: "42",
			severity: "high",
		});
	});
	it("rejects raw Sentry event.created", async () => {
		const input = signed(
			{
				action: "created",
				data: { event: { groupID: "42", eventID: "event", dateCreated: "2026-01-01T00:00:00Z" } },
			},
			"sentry-hook-signature",
		);
		input.headers.set("sentry-hook-resource", "event");
		await expect(sentryAlertAdapter.verifyAndNormalize(input)).rejects.toMatchObject({
			code: "INTEGRATION_PAYLOAD_INVALID",
		});
	});
});
