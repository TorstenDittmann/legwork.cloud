import { describe, expect, it } from "vitest";
import type { Diagnosis } from "@oncall-ai/contracts";
import { validateDiagnosisEvidence } from "./index";

const diagnosis: Diagnosis = {
  schemaVersion: "1", status: "diagnosed", title: "Null access", summary: "A nullable value is used.",
  rootCause: { statement: "Missing guard", confidence: 0.9 },
  evidence: [{ repositoryId: "repo", path: "src/a.ts", lineStart: 1, lineEnd: 1, excerpt: "value.name", explanation: "unguarded" }],
  suggestedFix: null, checksRun: [], limitations: [],
};

describe("evidence validation", () => {
  it("accepts matching connected source lines", async () => {
    const errors = await validateDiagnosisEvidence(diagnosis, { hasRepository: () => true, readLines: async () => "value.name" });
    expect(errors).toEqual([]);
  });
  it("rejects fabricated excerpts", async () => {
    const errors = await validateDiagnosisEvidence(diagnosis, { hasRepository: () => true, readLines: async () => "other" });
    expect(errors).toHaveLength(1);
  });
});
