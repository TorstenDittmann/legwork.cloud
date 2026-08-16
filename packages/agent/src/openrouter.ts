import { z } from "zod";
import {
	agentToolSchema,
	diagnosisSchema,
	githubActivityToolSchema,
	type Diagnosis,
	type ModelToolDefinition,
} from "@legwork/contracts";
import { AGENT_SYSTEM_PROMPT, FINAL_SYSTEM_PROMPT } from "./prompt";

export class ModelPrivacyRouteUnavailableError extends Error {
	readonly code = "MODEL_PRIVACY_ROUTE_UNAVAILABLE";
}
export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_call_id?: string;
	tool_calls?: unknown[];
}
export interface RawModelToolCall {
	callId: string;
	name: string;
	arguments: string;
}
export interface InvestigationTurnResult {
	message: ChatMessage;
	rawToolCalls: RawModelToolCall[];
	usage: { inputTokens: number; outputTokens: number };
}
export interface DiagnosisModelProvider {
	readonly model?: string;
	continueAgent(
		messages: ChatMessage[],
		tools?: ModelToolDefinition[],
		signal?: AbortSignal,
	): Promise<InvestigationTurnResult>;
	createDiagnosis(
		messages: ChatMessage[],
		repair?: string,
		signal?: AbortSignal,
	): Promise<{ diagnosis: Diagnosis; usage: { inputTokens: number; outputTokens: number } }>;
}

const providerPolicy = (model: string) => ({
	require_parameters: true,
	allow_fallbacks: true,
	...(model === "deepseek/deepseek-v4-flash-0731"
		? { max_price: { prompt: 0.14, completion: 0.28 } }
		: {}),
});
export const MAX_TOOL_CALLS_PER_TURN = 8;

export class ModelToolCallLimitError extends Error {
	readonly code = "MODEL_TOOL_CALL_LIMIT_EXCEEDED";
}

export class ModelCheckCallLimitError extends Error {
	readonly code = "MODEL_CHECK_CALL_LIMIT_EXCEEDED";
}

export class ModelDiagnosisValidationError extends Error {
	readonly code = "MODEL_DIAGNOSIS_INVALID";
	constructor(
		message: string,
		readonly usage: { inputTokens: number; outputTokens: number },
	) {
		super(message);
		this.name = "ModelDiagnosisValidationError";
	}
}
export function repositoryToolDefinitions(strict: boolean): ModelToolDefinition[] {
	return [
		{
			type: "function",
			function: {
				name: "list_tree",
				description: "List a bounded repository tree",
				...(strict ? { strict: true } : {}),
				parameters: z.toJSONSchema(agentToolSchema.options[0]),
			},
		},
		{
			type: "function",
			function: {
				name: "search_code",
				description: "Search repository text with ripgrep semantics",
				...(strict ? { strict: true } : {}),
				parameters: z.toJSONSchema(agentToolSchema.options[1]),
			},
		},
		{
			type: "function",
			function: {
				name: "read_file",
				description: "Read a bounded file line range",
				...(strict ? { strict: true } : {}),
				parameters: z.toJSONSchema(agentToolSchema.options[2]),
			},
		},
		{
			type: "function",
			function: {
				name: "run_check",
				description: "Run one fixed offline check if security policy permits",
				...(strict ? { strict: true } : {}),
				parameters: z.toJSONSchema(agentToolSchema.options[3]),
			},
		},
		{
			type: "function",
			function: {
				name: "github_recent_activity",
				description:
					"List recent GitHub Actions workflow runs and deployments for an approved repository",
				...(strict ? { strict: true } : {}),
				parameters: z.toJSONSchema(githubActivityToolSchema),
			},
		},
	];
}

interface OpenRouterResponse {
	choices?: Array<{
		message?: {
			role?: string;
			content?: string | null;
			tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
		};
	}>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
	error?: { message?: string; code?: string | number };
}

function strictProviderSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(strictProviderSchema);
	if (!schema || typeof schema !== "object") return schema;
	const record = { ...(schema as Record<string, unknown>) };
	for (const key of ["anyOf", "oneOf", "allOf"])
		if (Array.isArray(record[key])) record[key] = record[key].map(strictProviderSchema);
	if (record.type === "object" && record.properties && typeof record.properties === "object") {
		const properties = { ...(record.properties as Record<string, unknown>) };
		const required = new Set(Array.isArray(record.required) ? record.required : []);
		for (const [key, value] of Object.entries(properties)) {
			const normalized = strictProviderSchema(value);
			properties[key] = required.has(key) ? normalized : { anyOf: [normalized, { type: "null" }] };
		}
		record.properties = properties;
		record.required = Object.keys(properties);
	}
	return record;
}

const providerDiagnosisSchema = strictProviderSchema(z.toJSONSchema(diagnosisSchema));

export class OpenRouterProvider {
	readonly model: string;
	constructor(
		private readonly apiKey: string,
		model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731",
	) {
		this.model = model;
	}

	async #request(
		body: Record<string, unknown>,
		reasoningEffort: "medium",
		signal?: AbortSignal,
	): Promise<OpenRouterResponse> {
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
			body: JSON.stringify({
				model: this.model,
				provider: providerPolicy(this.model),
				reasoning: { effort: reasoningEffort, exclude: true },
				...body,
			}),
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
				: AbortSignal.timeout(120_000),
		});
		const payload = (await response.json()) as OpenRouterResponse;
		if (!response.ok) {
			const message = payload.error?.message ?? `OpenRouter request failed (${response.status})`;
			if (/privacy|zdr|data collection|no endpoints found/i.test(message))
				throw new ModelPrivacyRouteUnavailableError(message);
			throw new Error(message);
		}
		return payload;
	}

	async continueAgent(
		messages: ChatMessage[],
		tools?: ModelToolDefinition[],
		signal?: AbortSignal,
	): Promise<InvestigationTurnResult> {
		const strictTools = !this.model.startsWith("openai/gpt-5.6-");
		const availableTools = tools ?? repositoryToolDefinitions(strictTools);
		const payload = await this.#request(
			{
				messages: [{ role: "system", content: AGENT_SYSTEM_PROMPT }, ...messages],
				tools: availableTools.map((tool) => ({
					...tool,
					function: {
						...tool.function,
						...(strictTools ? { strict: true } : {}),
						parameters: strictTools
							? strictProviderSchema(tool.function.parameters)
							: tool.function.parameters,
					},
				})),
				tool_choice: "auto",
			},
			"medium",
			signal,
		);
		const raw = payload.choices?.[0]?.message;
		if (!raw) throw new Error("OpenRouter returned no assistant message");
		const message: ChatMessage = {
			role: "assistant",
			content: raw.content ?? null,
			...(raw.tool_calls ? { tool_calls: raw.tool_calls } : {}),
		};
		const calls = raw.tool_calls ?? [];
		return {
			message,
			rawToolCalls: calls.map((call) => ({
				callId: call.id,
				name: call.function.name,
				arguments: call.function.arguments,
			})),
			usage: {
				inputTokens: payload.usage?.prompt_tokens ?? 0,
				outputTokens: payload.usage?.completion_tokens ?? 0,
			},
		};
	}

	async createDiagnosis(
		messages: ChatMessage[],
		repair?: string,
		signal?: AbortSignal,
	): Promise<{ diagnosis: Diagnosis; usage: { inputTokens: number; outputTokens: number } }> {
		const payload = await this.#request(
			{
				messages: [
					{ role: "system", content: FINAL_SYSTEM_PROMPT },
					...messages,
					...(repair
						? [
								{
									role: "user",
									content: `Repair the structured result once. Validation errors: ${repair}`,
								},
							]
						: []),
				],
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "incident_diagnosis",
						strict: true,
						schema: providerDiagnosisSchema,
					},
				},
				max_tokens: 8_000,
			},
			"medium",
			signal,
		);
		const content = payload.choices?.[0]?.message?.content;
		if (!content) throw new Error("OpenRouter returned no diagnosis");
		const usage = {
			inputTokens: payload.usage?.prompt_tokens ?? 0,
			outputTokens: payload.usage?.completion_tokens ?? 0,
		};
		let diagnosis: Diagnosis;
		try {
			const candidate = JSON.parse(content) as {
				suggestedFix?: { patch?: string | null } | null;
			};
			if (candidate.suggestedFix?.patch === null) delete candidate.suggestedFix.patch;
			diagnosis = diagnosisSchema.parse(candidate);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid structured diagnosis";
			throw new ModelDiagnosisValidationError(message, usage);
		}
		return {
			diagnosis,
			usage,
		};
	}
}
