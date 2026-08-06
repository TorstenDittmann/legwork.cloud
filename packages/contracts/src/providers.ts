import type { AgentTool, Diagnosis, ToolResult } from "./agent";

export interface RunContext {
	runId: string;
	organizationId: string;
	repositories: Array<{ repositoryId: string; sha: string }>;
}

export interface SourceFile {
	path: string;
	content: Uint8Array;
	mode?: number;
}
export interface SandboxHandle {
	id: string;
	createdAt: Date;
	metadata?: Record<string, string>;
}
export type InspectionOperation = Exclude<AgentTool, { name: "run_check" }>;
export type CheckRequest = Extract<AgentTool, { name: "run_check" }>;

export interface SandboxProvider {
	create(run: RunContext): Promise<SandboxHandle>;
	upload(handle: SandboxHandle, files: AsyncIterable<SourceFile>): Promise<void>;
	inspect(handle: SandboxHandle, operation: InspectionOperation): Promise<ToolResult>;
	runCheck(handle: SandboxHandle, check: CheckRequest): Promise<ToolResult>;
	destroy(handle: SandboxHandle): Promise<void>;
}

export interface AgentTurn {
	messages: unknown[];
	tools: unknown[];
	model: string;
}
export interface AgentTurnResult {
	message: unknown;
	toolCall?: AgentTool;
	usage: { inputTokens: number; outputTokens: number };
}
export interface FinalDiagnosisInput {
	messages: unknown[];
	model: string;
}

export interface ModelProvider {
	continueAgent(input: AgentTurn): Promise<AgentTurnResult>;
	createDiagnosis(input: FinalDiagnosisInput): Promise<Diagnosis>;
}

export interface SourceProvider {
	resolveRevision(repositoryId: string, requestedSha?: string): Promise<string>;
	streamArchive(repositoryId: string, sha: string): Promise<ReadableStream<Uint8Array>>;
}
