import { describe, expect, it } from "vitest";
import { createIncidentRequestSchema, diagnosisSchema } from "./index";

describe("incident contract", () => {
  it("accepts a normalized incident", () => {
    expect(createIncidentRequestSchema.parse({
      externalId: "inc-1", title: "API failed", severity: "high", occurredAt: new Date().toISOString(),
    }).externalId).toBe("inc-1");
  });

  it("rejects oversized diagnostic content", () => {
    const result = createIncidentRequestSchema.safeParse({
      externalId: "inc-1", title: "API failed", severity: "high", occurredAt: new Date().toISOString(),
      stackTrace: "x".repeat(128 * 1024), logs: [{ message: "x" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("diagnosis contract", () => {
  it("requires bounded, attributable evidence", () => {
    const result = diagnosisSchema.safeParse({
      schemaVersion: "1", status: "diagnosed", title: "Bug", summary: "Summary",
      rootCause: { statement: "Cause", confidence: 0.8 },
      evidence: [{ repositoryId: "1", excerpt: "x", explanation: "why" }],
      suggestedFix: null, checksRun: [], limitations: [],
    });
    expect(result.success).toBe(false);
  });
});
