import { describe, expect, it } from "vitest";
import type { Diagnosis, SandboxProvider, ToolResult } from "@legwork/contracts";
import {
	describeTool,
	describeToolResult,
	hydrateDiagnosisEvidence,
	mapWithConcurrency,
	runDiagnosisAgent,
	validateDiagnosisEvidence,
} from "./index";
import { ModelDiagnosisValidationError, type DiagnosisModelProvider } from "./openrouter";

const diagnosis: Diagnosis = {
	schemaVersion: "1",
	status: "diagnosed",
	title: "Null access",
	summary: "A nullable value is used.",
	rootCause: { statement: "Missing guard", confidence: 0.9 },
	evidence: [
		{
			repositoryId: "repo",
			path: "src/a.ts",
			lineStart: 1,
			lineEnd: 1,
			excerpt: "value.name",
			explanation: "unguarded",
		},
	],
	suggestedFix: null,
	checksRun: [],
	limitations: [],
};

describe("evidence validation", () => {
	it("accepts matching connected source lines", async () => {
		const errors = await validateDiagnosisEvidence(diagnosis, {
			hasRepository: () => true,
			readLines: async () => "value.name",
		});
		expect(errors).toEqual([]);
	});
	it("hydrates file excerpts from numbered pinned source lines", async () => {
		const hydrated = await hydrateDiagnosisEvidence(
			{
				...diagnosis,
				evidence: [{ ...diagnosis.evidence[0]!, excerpt: "src/a.ts:1" }],
			},
			{
				hasRepository: () => true,
				readLines: async () => "1: const value = record.value;\n2: value.name",
			},
		);
		expect(hydrated.evidence[0]?.excerpt).toBe("const value = record.value;\nvalue.name");
		expect(
			await validateDiagnosisEvidence(hydrated, {
				hasRepository: () => true,
				readLines: async () => "1: const value = record.value;\n2: value.name",
			}),
		).toEqual([]);
	});
	it("requires evidence for diagnosed results", async () => {
		const errors = await validateDiagnosisEvidence(
			{ ...diagnosis, evidence: [] },
			{ hasRepository: () => true, readLines: async () => null },
		);
		expect(errors).toContain("diagnosed results require at least one evidence citation");
	});
	it("rejects fabricated excerpts", async () => {
		const errors = await validateDiagnosisEvidence(diagnosis, {
			hasRepository: () => true,
			readLines: async () => "other",
		});
		expect(errors).toHaveLength(1);
	});
	it("rejects excerpts that pad the real source with fabricated content", async () => {
		const padded = {
			...diagnosis,
			evidence: [
				{
					...diagnosis.evidence[0]!,
					excerpt: "value.name // and this fabricated line proves the bug",
				},
			],
		};
		const errors = await validateDiagnosisEvidence(padded, {
			hasRepository: () => true,
			readLines: async () => "value.name",
		});
		expect(errors).toEqual(["evidence[0] excerpt does not match cited lines"]);
	});
});

describe("agent activity", () => {
	it("describes concrete tool actions without including source output", () => {
		const tool = {
			name: "read_file" as const,
			repositoryId: "repo",
			path: "src/cache.go",
			start: 40,
			end: 72,
		};
		expect(describeTool(tool)).toBe("Reading src/cache.go, lines 40–72");
		expect(
			describeToolResult(tool, {
				status: "ok",
				output: "secret source line\nanother line",
				truncated: false,
				durationMs: 12,
			}),
		).toBe("Read 2 lines from src/cache.go");
	});

	it("includes bounded search context and failure limitations", () => {
		const tool = {
			name: "search_code" as const,
			repositoryId: "repo",
			query: "clear cache",
			glob: "*.go",
		};
		expect(describeTool(tool)).toBe("Searching for “clear cache” in *.go");
		expect(
			describeToolResult(tool, {
				status: "unavailable",
				output: "",
				truncated: false,
				durationMs: 1,
				limitation: "No approved command was discovered",
			}),
		).toContain("No approved command was discovered");
	});
});

describe("parallel investigation", () => {
	it("caps concurrency at four and preserves tool response order", async () => {
		let active = 0;
		let maximum = 0;
		const completionOrder: string[] = [];
		const delays = [50, 10, 30, 5, 15];
		const sandboxProvider = {
			inspect: async (_sandbox, operation) => {
				if (operation.name !== "read_file") throw new Error("Expected a read_file operation");
				active += 1;
				maximum = Math.max(maximum, active);
				const index = Number(operation.path.split("-")[1]);
				await new Promise((resolve) => setTimeout(resolve, delays[index]));
				active -= 1;
				completionOrder.push(operation.path);
				return {
					status: index === 2 ? "error" : "ok",
					output: operation.path,
					truncated: false,
					durationMs: delays[index] ?? 0,
				} satisfies ToolResult;
			},
		} as Pick<SandboxProvider, "inspect"> as SandboxProvider;
		let turn = 0;
		let toolMessages: Array<{ tool_call_id?: string }> = [];
		const model: DiagnosisModelProvider = {
			continueAgent: async (messages) => {
				turn += 1;
				if (turn === 2) {
					toolMessages = messages.filter((message) => message.role === "tool");
					return {
						message: { role: "assistant" as const, content: "done" },
						rawToolCalls: [],
						usage: { inputTokens: 0, outputTokens: 0 },
					};
				}
				const rawToolCalls = Array.from({ length: 5 }, (_, index) => ({
					name: "read_file",
					arguments: JSON.stringify({
						repositoryId: "repo",
						path: `file-${index}`,
						start: 1,
						end: 2,
					}),
					callId: `call-${index}`,
				}));
				return {
					message: { role: "assistant" as const, content: null, tool_calls: [] },
					rawToolCalls,
					usage: { inputTokens: 0, outputTokens: 0 },
				};
			},
			createDiagnosis: async () => ({
				diagnosis: { ...diagnosis, status: "inconclusive" as const, evidence: [] },
				usage: { inputTokens: 0, outputTokens: 0 },
			}),
		};
		const activities: Array<{ sequence: number; kind: string; summary: string }> = [];
		await runDiagnosisAgent(model, {
			incident: {},
			repositories: [{ repositoryId: "repo", sha: "a".repeat(40) }],
			sandbox: { id: "sandbox", createdAt: new Date() },
			sandboxProvider,
			snapshot: { hasRepository: () => true, readLines: async () => null },
			onActivity: async (activity) => {
				activities.push(activity);
			},
		});
		expect(maximum).toBe(4);
		expect(completionOrder[0]).not.toBe("file-0");
		expect(toolMessages.map((message) => message.tool_call_id)).toEqual([
			"call-0",
			"call-1",
			"call-2",
			"call-3",
			"call-4",
		]);
		expect(new Set(activities.map(({ sequence }) => sequence)).size).toBe(activities.length);
		expect(activities.some(({ summary }) => summary.includes("Running 5 independent"))).toBe(true);
	});

	it("the bounded mapper preserves result order", async () => {
		const results = await mapWithConcurrency([30, 5, 15], 2, async (delay, index) => {
			await new Promise((resolve) => setTimeout(resolve, delay));
			return index;
		});
		expect(results).toEqual([0, 1, 2]);
	});
});

describe("diagnosis repair", () => {
	it("uses the single repair attempt for an invalid structured response", async () => {
		const repairs: Array<string | undefined> = [];
		const model: DiagnosisModelProvider = {
			continueAgent: async () => ({
				message: { role: "assistant", content: "done" },
				rawToolCalls: [],
				usage: { inputTokens: 1, outputTokens: 2 },
			}),
			createDiagnosis: async (_messages, repair) => {
				repairs.push(repair);
				if (!repair)
					throw new ModelDiagnosisValidationError("lineStart is required", {
						inputTokens: 3,
						outputTokens: 4,
					});
				return {
					diagnosis: {
						...diagnosis,
						status: "inconclusive",
						rootCause: null,
						evidence: [],
					},
					usage: { inputTokens: 5, outputTokens: 6 },
				};
			},
		};
		const result = await runDiagnosisAgent(model, {
			incident: {},
			repositories: [{ repositoryId: "repo", sha: "a".repeat(40) }],
			sandbox: { id: "sandbox", createdAt: new Date() },
			sandboxProvider: {} as SandboxProvider,
			snapshot: { hasRepository: () => true, readLines: async () => null },
			onActivity: async () => {},
		});
		expect(repairs).toEqual([undefined, "lineStart is required"]);
		expect(result.diagnosis.status).toBe("inconclusive");
		expect(result.inputTokens).toBe(9);
		expect(result.outputTokens).toBe(12);
	});
});
