import type { Diagnosis, SandboxHandle, SandboxProvider } from "@oncall-ai/contracts";
import type { SnapshotIndex } from "./evidence";
import { validateDiagnosisEvidence } from "./evidence";
import type { ChatMessage } from "./openrouter";
import { OpenRouterProvider } from "./openrouter";

export interface AgentActivity {
	sequence: number;
	kind: string;
	summary: string;
	toolName?: string;
	durationMs?: number;
}
export interface AgentRunInput {
	incident: unknown;
	repositories: Array<{ repositoryId: string; sha: string }>;
	sandbox: SandboxHandle;
	sandboxProvider: SandboxProvider;
	snapshot: SnapshotIndex;
	onActivity(activity: AgentActivity): Promise<void>;
	signal?: AbortSignal;
}

export interface AgentRunResult {
	diagnosis: Diagnosis;
	inputTokens: number;
	outputTokens: number;
}

export async function runDiagnosisAgent(
	model: OpenRouterProvider,
	input: AgentRunInput,
): Promise<AgentRunResult> {
	const messages: ChatMessage[] = [
		{
			role: "user",
			content: JSON.stringify({
				task: "Diagnose this incident",
				incident: input.incident,
				repositories: input.repositories,
			}),
		},
	];
	let inputTokens = 0;
	let outputTokens = 0;
	let sequence = 0;
	for (let turn = 0; turn < 20; turn += 1) {
		if (input.signal?.aborted) throw input.signal.reason;
		const next = await model.continueAgent(messages);
		inputTokens += next.usage.inputTokens;
		outputTokens += next.usage.outputTokens;
		messages.push(next.message);
		if (!next.toolCall) break;
		const { callId, ...tool } = next.toolCall;
		const result =
			tool.name === "run_check"
				? await input.sandboxProvider.runCheck(input.sandbox, tool)
				: await input.sandboxProvider.inspect(input.sandbox, tool);
		sequence += 1;
		await input.onActivity({
			sequence,
			kind: "tool",
			summary: `${tool.name}: ${result.status}`,
			toolName: tool.name,
			durationMs: result.durationMs,
		});
		messages.push({ role: "tool", tool_call_id: callId, content: JSON.stringify(result) });
	}

	let final = await model.createDiagnosis(messages);
	inputTokens += final.usage.inputTokens;
	outputTokens += final.usage.outputTokens;
	let errors = await validateDiagnosisEvidence(final.diagnosis, input.snapshot);
	if (errors.length > 0) {
		final = await model.createDiagnosis(messages, errors.join("; "));
		inputTokens += final.usage.inputTokens;
		outputTokens += final.usage.outputTokens;
		errors = await validateDiagnosisEvidence(final.diagnosis, input.snapshot);
	}
	if (errors.length > 0) {
		return {
			inputTokens,
			outputTokens,
			diagnosis: {
				schemaVersion: "1",
				status: "inconclusive",
				title: "Evidence validation failed",
				summary: "The analysis could not produce a diagnosis with verifiable evidence.",
				rootCause: null,
				evidence: [],
				suggestedFix: null,
				checksRun: [],
				limitations: errors,
			},
		};
	}
	return { diagnosis: final.diagnosis, inputTokens, outputTokens };
}
