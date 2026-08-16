import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelDiagnosisValidationError, OpenRouterProvider } from "./openrouter";

const response = (message: Record<string, unknown>) =>
	new Response(JSON.stringify({ choices: [{ message }], usage: {} }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

const call = (id: string, name = "read_file", args: Record<string, unknown> = {}) => ({
	id,
	function: {
		name,
		arguments: JSON.stringify({
			repositoryId: "repo",
			path: `src/${id}.ts`,
			start: 1,
			end: 10,
			...args,
		}),
	},
});

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("OpenRouter tool calls", () => {
	it("defaults to DeepSeek V4 Flash and honors the environment override", () => {
		const configuredModel = process.env.OPENROUTER_MODEL;
		try {
			delete process.env.OPENROUTER_MODEL;
			expect(new OpenRouterProvider("key").model).toBe("deepseek/deepseek-v4-flash-0731");
			process.env.OPENROUTER_MODEL = "custom/model";
			expect(new OpenRouterProvider("key").model).toBe("custom/model");
		} finally {
			if (configuredModel === undefined) delete process.env.OPENROUTER_MODEL;
			else process.env.OPENROUTER_MODEL = configuredModel;
		}
	});

	it("parses every tool call in provider order", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				response({ role: "assistant", content: null, tool_calls: [call("a"), call("b")] }),
			) as typeof fetch;
		const result = await new OpenRouterProvider("key", "model").continueAgent([]);
		expect(result.rawToolCalls.map(({ callId }) => callId)).toEqual(["a", "b"]);
	});

	it("returns an empty tool array when investigation is complete", async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(response({ role: "assistant", content: "done" })) as typeof fetch;
		const result = await new OpenRouterProvider("key", "model").continueAgent([]);
		expect(result.rawToolCalls).toEqual([]);
	});

	it("returns invalid or excessive batches for graph-level validation", async () => {
		const fetch = vi.fn();
		globalThis.fetch = fetch as typeof globalThis.fetch;
		fetch.mockResolvedValueOnce(
			response({
				role: "assistant",
				content: null,
				tool_calls: [call("bad", "read_file", { end: 0 })],
			}),
		);
		const invalid = await new OpenRouterProvider("key", "model").continueAgent([]);
		expect(invalid.rawToolCalls).toHaveLength(1);
		fetch.mockResolvedValueOnce(
			response({
				role: "assistant",
				content: null,
				tool_calls: Array.from({ length: 9 }, (_, index) => call(String(index))),
			}),
		);
		const excessive = await new OpenRouterProvider("key", "model").continueAgent([]);
		expect(excessive.rawToolCalls).toHaveLength(9);
	});

	it("preserves multiple checks for atomic graph-level rejection", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			response({
				role: "assistant",
				content: null,
				tool_calls: [
					call("a", "run_check", {
						path: undefined,
						start: undefined,
						end: undefined,
						check: "test",
					}),
					call("b", "run_check", {
						path: undefined,
						start: undefined,
						end: undefined,
						check: "lint",
					}),
				],
			}),
		) as typeof fetch;
		const result = await new OpenRouterProvider("key", "model").continueAgent([]);
		expect(result.rawToolCalls.map(({ name }) => name)).toEqual(["run_check", "run_check"]);
	});

	it("uses the configured request policy and medium reasoning for every operation", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(response({ role: "assistant", content: "done" }))
			.mockResolvedValueOnce(
				response({
					role: "assistant",
					content: JSON.stringify({
						schemaVersion: "1",
						status: "inconclusive",
						title: "No result",
						summary: "No result",
						rootCause: null,
						evidence: [],
						suggestedFix: null,
						checksRun: [],
						limitations: [],
					}),
				}),
			)
			.mockResolvedValueOnce(
				response({
					role: "assistant",
					content: JSON.stringify({
						schemaVersion: "1",
						status: "inconclusive",
						title: "Repaired result",
						summary: "Repaired result",
						rootCause: null,
						evidence: [],
						suggestedFix: null,
						checksRun: [],
						limitations: [],
					}),
				}),
			);
		globalThis.fetch = fetch as typeof globalThis.fetch;
		const provider = new OpenRouterProvider("key", "deepseek/deepseek-v4-flash-0731");
		await provider.continueAgent([]);
		await provider.createDiagnosis([]);
		await provider.createDiagnosis([], "repair this result");
		const investigation = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
		const diagnosis = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
		const repair = JSON.parse(String(fetch.mock.calls[2]?.[1]?.body));
		expect(investigation.reasoning.effort).toBe("medium");
		expect(diagnosis.reasoning.effort).toBe("medium");
		const suggestedFixSchema = diagnosis.response_format.json_schema.schema.properties.suggestedFix;
		const suggestedFixObject = suggestedFixSchema.anyOf.find(
			(option: { type?: string }) => option.type === "object",
		);
		expect(suggestedFixObject.required).toContain("patch");
		expect(suggestedFixObject.properties.patch.anyOf).toContainEqual({ type: "null" });
		expect(repair.reasoning.effort).toBe("medium");
		expect(investigation.reasoning.exclude).toBe(true);
		expect(diagnosis.reasoning.exclude).toBe(true);
		expect(investigation.provider).toEqual({
			require_parameters: true,
			allow_fallbacks: true,
			max_price: { prompt: 0.14, completion: 0.28 },
		});
		expect(investigation).not.toHaveProperty("temperature");
		expect(investigation.provider).not.toHaveProperty("data_collection");
		expect(investigation).not.toHaveProperty("parallel_tool_calls");
		expect(investigation.tools).toSatisfy((tools: Array<{ function: { strict?: boolean } }>) =>
			tools.every((tool) => tool.function.strict === true),
		);
	});

	it("omits provider-side strict tools only for GPT-5.6", async () => {
		const fetch = vi.fn().mockResolvedValue(response({ role: "assistant", content: "done" }));
		globalThis.fetch = fetch as typeof globalThis.fetch;
		await new OpenRouterProvider("key", "openai/gpt-5.6-luna").continueAgent([]);
		const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
		expect(request.provider).not.toHaveProperty("max_price");
		expect(request.tools).toSatisfy((tools: Array<{ function: { strict?: boolean } }>) =>
			tools.every((tool) => tool.function.strict === undefined),
		);
	});

	it("normalizes a nullable provider patch before local diagnosis validation", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			response({
				role: "assistant",
				content: JSON.stringify({
					schemaVersion: "1",
					status: "inconclusive",
					title: "No result",
					summary: "No result",
					rootCause: null,
					evidence: [],
					suggestedFix: { description: "Try a fix", steps: [], patch: null },
					checksRun: [],
					limitations: [],
				}),
			}),
		) as typeof fetch;
		const result = await new OpenRouterProvider("key", "model").createDiagnosis([]);
		expect(result.diagnosis.suggestedFix).toEqual({ description: "Try a fix", steps: [] });
	});

	it("returns diagnosis validation failures with token usage for repair", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								role: "assistant",
								content: JSON.stringify({
									schemaVersion: "1",
									status: "diagnosed",
									title: "Invalid evidence",
									summary: "Missing lines",
									rootCause: null,
									evidence: [
										{ repositoryId: "repo", path: "a.ts", excerpt: "x", explanation: "x" },
									],
									suggestedFix: null,
									checksRun: [],
									limitations: [],
								}),
							},
						},
					],
					usage: { prompt_tokens: 12, completion_tokens: 34 },
				}),
			),
		) as typeof fetch;
		const error = await new OpenRouterProvider("key", "model")
			.createDiagnosis([])
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ModelDiagnosisValidationError);
		expect((error as ModelDiagnosisValidationError).usage).toEqual({
			inputTokens: 12,
			outputTokens: 34,
		});
	});
});
