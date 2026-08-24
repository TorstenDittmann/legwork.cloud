import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	createIncidentRequestSchema,
	diagnosisSchema,
	githubActivityToolSchema,
	serviceConnectionResponseSchema,
} from "./index";

describe("incident contract", () => {
	it("accepts a normalized incident", () => {
		expect(
			createIncidentRequestSchema.parse({
				externalId: "inc-1",
				title: "API failed",
				severity: "high",
				occurredAt: new Date().toISOString(),
			}).externalId,
		).toBe("inc-1");
	});

	it("rejects oversized diagnostic content", () => {
		const result = createIncidentRequestSchema.safeParse({
			externalId: "inc-1",
			title: "API failed",
			severity: "high",
			occurredAt: new Date().toISOString(),
			stackTrace: "x".repeat(128 * 1024),
			logs: [{ message: "x" }],
		});
		expect(result.success).toBe(false);
	});

	it("accepts the minimal authenticated service readiness response", () => {
		expect(
			serviceConnectionResponseSchema.parse({
				status: "ready",
				service: { name: "Payments API", slug: "payments-api" },
			}),
		).toEqual({
			status: "ready",
			service: { name: "Payments API", slug: "payments-api" },
		});
	});
});

describe("diagnosis contract", () => {
	it("accepts bounded GitHub activity tools", () => {
		expect(
			githubActivityToolSchema.parse({
				name: "github_recent_activity",
				repositoryId: "repo-1",
				lookbackHours: 24,
			}),
		).toMatchObject({ lookbackHours: 24 });
		expect(
			githubActivityToolSchema.safeParse({
				name: "github_recent_activity",
				repositoryId: "repo-1",
				lookbackHours: 169,
			}).success,
		).toBe(false);
	});

	it("accepts GitHub activity as attributable evidence", () => {
		const result = diagnosisSchema.safeParse({
			schemaVersion: "1",
			status: "diagnosed",
			title: "Failed deployment",
			summary: "A deployment failed immediately before the incident.",
			rootCause: { statement: "The production deployment failed", confidence: 0.8 },
			evidence: [
				{
					provider: "github",
					sourceType: "deployments",
					operation: "github_recent_activity",
					locator: { repositoryId: "repo-1", lookbackHours: 24 },
					excerpt: '"state": "failure"',
					explanation: "The latest production deployment failed.",
				},
			],
			suggestedFix: null,
			checksRun: [],
			limitations: [],
		});
		expect(result.success).toBe(true);
	});

	it("requires bounded, attributable evidence", () => {
		const result = diagnosisSchema.safeParse({
			schemaVersion: "1",
			status: "diagnosed",
			title: "Bug",
			summary: "Summary",
			rootCause: { statement: "Cause", confidence: 0.8 },
			evidence: [{ repositoryId: "1", excerpt: "x", explanation: "why" }],
			suggestedFix: null,
			checksRun: [],
			limitations: [],
		});
		expect(result.success).toBe(false);
	});

	it("exposes required file line ranges in the provider JSON schema", () => {
		const schema = z.toJSONSchema(diagnosisSchema) as {
			properties: { evidence: { items: { anyOf: Array<{ required: string[] }> } } };
		};
		const variants = schema.properties.evidence.items.anyOf;
		expect(variants).toHaveLength(3);
		expect(variants[0]?.required).toEqual(
			expect.arrayContaining([
				"repositoryId",
				"path",
				"lineStart",
				"lineEnd",
				"excerpt",
				"explanation",
			]),
		);
		expect(variants[1]?.required).toEqual(
			expect.arrayContaining(["repositoryId", "command", "excerpt", "explanation"]),
		);
		expect(variants[2]?.required).toEqual(
			expect.arrayContaining([
				"provider",
				"sourceType",
				"operation",
				"locator",
				"excerpt",
				"explanation",
			]),
		);
	});
});
