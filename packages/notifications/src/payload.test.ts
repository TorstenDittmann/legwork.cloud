import { describe, expect, it } from "vitest";
import type { Diagnosis } from "@legwork/contracts";
import { buildNotificationPayload, buildTestPayload } from "./payload";

const secretExcerpt = "const STRIPE_KEY = 'sk_live_do_not_leak'";

function diagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
	return {
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
		...overrides,
	} as Diagnosis;
}

const base = {
	event: "analysis.completed" as const,
	status: "completed" as const,
	serviceName: "payments-api",
	incidentTitle: "5xx spike on /checkout",
	dashboardUrl: "https://app.legwork.dev/incidents/inc-1",
	completedAt: new Date("2026-08-16T10:00:00Z"),
};

describe("notification payload", () => {
	it("carries the summary and root cause from the diagnosis", () => {
		const payload = buildNotificationPayload({ ...base, diagnosis: diagnosis() });
		expect(payload.summary).toBe("The payments client retries without a ceiling.");
		expect(payload.rootCause).toEqual({
			statement: "Unbounded retry in the payments client",
			confidence: 0.82,
		});
		expect(payload.serviceName).toBe("payments-api");
	});

	it("turns file evidence into citations without carrying the excerpt", () => {
		const payload = buildNotificationPayload({ ...base, diagnosis: diagnosis() });
		expect(payload.citations).toEqual([
			{ repositoryId: "repo-1", path: "src/payments/retry.ts", lineStart: 88, lineEnd: 104 },
		]);
		expect(JSON.stringify(payload)).not.toContain(secretExcerpt);
	});

	it("drops command and provider evidence, which have no file coordinates", () => {
		const payload = buildNotificationPayload({
			...base,
			diagnosis: diagnosis({
				evidence: [
					{
						repositoryId: "repo-1",
						command: "bun test",
						excerpt: "3 failed",
						explanation: "Tests fail",
					},
					{
						provider: "sentry",
						sourceType: "issue",
						operation: "sentry_get_issue",
						locator: { issueId: "42" },
						excerpt: "TimeoutError",
						explanation: "Matching issue",
					},
				],
			}),
		});
		expect(payload.citations).toEqual([]);
	});

	it("caps citations so a fifty-item diagnosis stays readable", () => {
		const payload = buildNotificationPayload({
			...base,
			diagnosis: diagnosis({
				evidence: Array.from({ length: 12 }, (_, index) => ({
					repositoryId: "repo-1",
					path: `src/file-${index}.ts`,
					lineStart: 1,
					lineEnd: 2,
					excerpt: secretExcerpt,
					explanation: "why",
				})),
			}),
		});
		expect(payload.citations).toHaveLength(5);
		expect(payload.citations[0]?.path).toBe("src/file-0.ts");
	});

	it("handles a failed run that produced no diagnosis", () => {
		const payload = buildNotificationPayload({
			...base,
			event: "analysis.failed",
			status: "failed",
			diagnosis: null,
		});
		expect(payload.summary).toBeNull();
		expect(payload.rootCause).toBeNull();
		expect(payload.citations).toEqual([]);
	});

	it("builds a test payload that contains no incident data", () => {
		const payload = buildTestPayload("https://app.legwork.dev");
		expect(payload.event).toBe("notification.test");
		expect(payload.citations).toEqual([]);
	});
});
