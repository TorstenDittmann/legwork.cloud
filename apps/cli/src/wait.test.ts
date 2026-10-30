import { describe, expect, it } from "vitest";
import type { IncidentResultResponse } from "@legwork/contracts";
import { parseTimeoutSeconds, resultExitCode, waitForIncident } from "./wait";

const base: IncidentResultResponse = {
	incidentId: "c3e95ed0-09e8-42e4-81bc-818332ea0d42",
	externalId: "deploy-42",
	title: "Deployment failed",
	severity: "high",
	runId: "a6d0ee4f-7db9-46ef-9839-3fd71632b419",
	status: "queued",
	failure: null,
	diagnosis: null,
	dashboardUrl: "https://legwork.example/incidents/c3e95ed0-09e8-42e4-81bc-818332ea0d42",
	createdAt: "2026-08-23T12:00:00.000Z",
	completedAt: null,
};

function clock() {
	let time = 0;
	return {
		now: () => time,
		sleep: async (ms: number) => {
			time += ms;
		},
	};
}

describe("waitForIncident", () => {
	it("polls until the run reaches a terminal status", async () => {
		const statuses = ["queued", "analyzing", "completed"] as const;
		let calls = 0;
		const result = await waitForIncident(async () => ({ ...base, status: statuses[calls++]! }), {
			timeoutMs: 60_000,
			intervalMs: 1_000,
			...clock(),
		});
		expect(result.status).toBe("completed");
		expect(calls).toBe(3);
	});

	it("gives up after the timeout with the dashboard link", async () => {
		await expect(
			waitForIncident(async () => ({ ...base, status: "analyzing" }), {
				timeoutMs: 5_000,
				intervalMs: 1_000,
				...clock(),
			}),
		).rejects.toThrow(`Analysis still analyzing after 5s: ${base.dashboardUrl}`);
	});
});

describe("resultExitCode", () => {
	it("treats only diagnosed outcomes as success", () => {
		expect(resultExitCode({ ...base, status: "completed" })).toBe(0);
		expect(resultExitCode({ ...base, status: "inconclusive" })).toBe(0);
		expect(resultExitCode({ ...base, status: "failed" })).toBe(1);
		expect(resultExitCode({ ...base, status: "cancelled" })).toBe(1);
	});
});

describe("parseTimeoutSeconds", () => {
	it("defaults and validates", () => {
		expect(parseTimeoutSeconds(undefined)).toBe(600);
		expect(parseTimeoutSeconds("30")).toBe(30);
		expect(() => parseTimeoutSeconds("0")).toThrow("--timeout");
		expect(() => parseTimeoutSeconds("1.5")).toThrow("--timeout");
	});
});
