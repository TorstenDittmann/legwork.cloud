import { readFile, access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const caseSchema = z.object({ id: z.string(), language: z.enum(["typescript", "python", "go"]), repository: z.string(), title: z.string(), severity: z.enum(["critical", "high", "medium", "low", "unknown"]), expected: z.object({ path: z.string(), terms: z.array(z.string()).min(2) }) });
describe("seeded incident evaluations", () => {
  it("contains at least 20 attributable cases across TypeScript, Python, and Go", async () => {
    const root = new URL("./", import.meta.url); const cases = z.array(caseSchema).parse(JSON.parse(await readFile(new URL("cases.json", root), "utf8")));
    expect(cases.length).toBeGreaterThanOrEqual(20); expect(new Set(cases.map((item) => item.language))).toEqual(new Set(["typescript", "python", "go"]));
    await Promise.all(cases.map((item) => access(new URL(`repositories/${item.repository}/${item.expected.path}`, root))));
  });
});
