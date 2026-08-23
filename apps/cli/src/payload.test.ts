import { describe, expect, it } from "vitest";
import { createIdempotencyKey, inferExternalId, inferredContext, parseContext } from "./payload";

describe("incident metadata", () => {
	it("parses repeated key=value context", () => {
		expect(parseContext(["region=iad", "detail=a=b"])).toEqual({
			region: "iad",
			detail: "a=b",
		});
		expect(() => parseContext(["missing-separator"])).toThrow("key=value");
	});

	it("derives unique GitHub Actions identity without command arguments", () => {
		const environment = {
			GITHUB_ACTIONS: "true",
			GITHUB_RUN_ID: "123",
			GITHUB_RUN_ATTEMPT: "2",
			GITHUB_JOB: "test",
			GITHUB_REPOSITORY: "legwork/app",
		};
		expect(inferExternalId(environment, "event-1")).toBe("github-actions:123:2:test:event-1");
		expect(inferredContext(environment)).toMatchObject({
			"ci.provider": "github-actions",
			"ci.run_id": "123",
			repository: "legwork/app",
		});
	});

	it("generates a bounded, deterministic idempotency key", () => {
		const first = createIdempotencyKey("payments-api", "deploy-42");
		expect(first).toBe(createIdempotencyKey("payments-api", "deploy-42"));
		expect(first.length).toBeLessThanOrEqual(128);
	});
});
