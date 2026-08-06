import { z } from "zod";
import { agentToolSchema, diagnosisSchema, type AgentTool, type Diagnosis } from "@oncall-ai/contracts";
import { AGENT_SYSTEM_PROMPT, FINAL_SYSTEM_PROMPT } from "./prompt";

export class ModelPrivacyRouteUnavailableError extends Error { readonly code = "MODEL_PRIVACY_ROUTE_UNAVAILABLE"; }
export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }
export interface ToolCallResult { message: ChatMessage; toolCall?: AgentTool & { callId: string }; usage: { inputTokens: number; outputTokens: number } }

const providerPolicy = { require_parameters: true, data_collection: "deny", zdr: true, allow_fallbacks: true } as const;
const toolDefinitions = [
  { type: "function", function: { name: "list_tree", description: "List a bounded repository tree", strict: true, parameters: z.toJSONSchema(agentToolSchema.options[0]) } },
  { type: "function", function: { name: "search_code", description: "Search repository text with ripgrep semantics", strict: true, parameters: z.toJSONSchema(agentToolSchema.options[1]) } },
  { type: "function", function: { name: "read_file", description: "Read a bounded file line range", strict: true, parameters: z.toJSONSchema(agentToolSchema.options[2]) } },
  { type: "function", function: { name: "run_check", description: "Run one fixed offline check if security policy permits", strict: true, parameters: z.toJSONSchema(agentToolSchema.options[3]) } },
];

interface OpenRouterResponse {
  choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number };
}

export class OpenRouterProvider {
  readonly model: string;
  constructor(private readonly apiKey: string, model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731") { this.model = model; }

  async #request(body: Record<string, unknown>): Promise<OpenRouterResponse> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, provider: providerPolicy, temperature: 0.2, reasoning: { effort: "medium", exclude: true }, ...body }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await response.json() as OpenRouterResponse;
    if (!response.ok) {
      const message = payload.error?.message ?? `OpenRouter request failed (${response.status})`;
      if (/provider|privacy|zdr|data collection|route/i.test(message)) throw new ModelPrivacyRouteUnavailableError(message);
      throw new Error(message);
    }
    return payload;
  }

  async continueAgent(messages: ChatMessage[]): Promise<ToolCallResult> {
    const payload = await this.#request({
      messages: [{ role: "system", content: AGENT_SYSTEM_PROMPT }, ...messages],
      tools: toolDefinitions, tool_choice: "auto", parallel_tool_calls: false,
    });
    const raw = payload.choices?.[0]?.message;
    if (!raw) throw new Error("OpenRouter returned no assistant message");
    const message: ChatMessage = { role: "assistant", content: raw.content ?? null, ...(raw.tool_calls ? { tool_calls: raw.tool_calls } : {}) };
    const call = raw.tool_calls?.[0];
    let toolCall: ToolCallResult["toolCall"];
    if (call) {
      const parsed = agentToolSchema.parse({ name: call.function.name, ...JSON.parse(call.function.arguments) });
      toolCall = { ...parsed, callId: call.id };
    }
    return {
      message, ...(toolCall ? { toolCall } : {}),
      usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 },
    };
  }

  async createDiagnosis(messages: ChatMessage[], repair?: string): Promise<{ diagnosis: Diagnosis; usage: { inputTokens: number; outputTokens: number } }> {
    const payload = await this.#request({
      messages: [{ role: "system", content: FINAL_SYSTEM_PROMPT }, ...messages, ...(repair ? [{ role: "user", content: `Repair the structured result once. Validation errors: ${repair}` }] : [])],
      response_format: { type: "json_schema", json_schema: { name: "incident_diagnosis", strict: true, schema: z.toJSONSchema(diagnosisSchema) } },
      max_tokens: 8_000,
    });
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned no diagnosis");
    return {
      diagnosis: diagnosisSchema.parse(JSON.parse(content)),
      usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 },
    };
  }
}
