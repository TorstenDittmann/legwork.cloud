import type { AgentTool, Diagnosis, ToolResult } from "./agent";
import { z } from "zod";

export const providerKindSchema = z.enum(["grafana", "sentry"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;
export type ProviderCapability = "logs" | "metrics" | "traces" | "issues" | "events" | "releases";

export interface GrafanaDataSourceConfig {
	uid: string;
	type: "loki" | "prometheus" | "tempo";
}

export type ProviderConnectionConfig =
	| {
			provider: "grafana";
			mode: "grafana_cloud" | "grafana_http";
			grafanaUrl: string;
			logs?: GrafanaDataSourceConfig;
			metrics?: GrafanaDataSourceConfig;
			traces?: GrafanaDataSourceConfig;
	  }
	| {
			provider: "sentry";
			mode: "sentry_cloud" | "sentry_http";
			sentryUrl: string;
			organizationSlug: string;
			projectSlug: string;
	  };

export type ProviderCredential =
	| { provider: "grafana"; mode: "grafana_cloud"; accessPolicyToken: string }
	| { provider: "grafana"; mode: "grafana_http"; serviceAccountToken: string }
	| { provider: "sentry"; apiToken: string };

export interface ProviderLink {
	label: string;
	url: string;
}
export interface NormalizedProviderAlert {
	externalId: string;
	status: "firing" | "resolved";
	startedAt: string;
	endedAt?: string;
	title?: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
}
export interface NormalizedAlertEvent {
	provider: ProviderKind;
	eventType: "firing" | "acknowledged" | "resolved";
	groupKey: string;
	episodeStartedAt: string;
	endedAt?: string;
	title: string;
	description?: string;
	severity: "critical" | "high" | "medium" | "low" | "unknown";
	environment?: string;
	primaryCommitSha?: string;
	children: NormalizedProviderAlert[];
	links: ProviderLink[];
	context: Record<string, string | number | boolean | null>;
}

const offsets = {
	startOffsetMinutes: z.number().int().min(-120).max(30),
	endOffsetMinutes: z.number().int().min(-120).max(30),
};
export const providerToolSchemas = [
	z
		.object({
			name: z.literal("grafana_query_logs"),
			query: z.string().min(1).max(2048),
			...offsets,
			limit: z.number().int().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			name: z.literal("grafana_query_metrics"),
			query: z.string().min(1).max(2048),
			...offsets,
			stepSeconds: z.number().int().min(1).max(3600).optional(),
		})
		.strict(),
	z
		.object({
			name: z.literal("grafana_query_traces"),
			query: z.string().min(1).max(2048),
			...offsets,
			limit: z.number().int().min(1).max(20).optional(),
		})
		.strict(),
	z.object({ name: z.literal("sentry_get_issue") }).strict(),
	z
		.object({
			name: z.literal("sentry_get_event"),
			selection: z.enum(["latest", "recommended", "oldest"]),
		})
		.strict(),
	z
		.object({
			name: z.literal("sentry_list_events"),
			query: z.string().max(512).optional(),
			limit: z.number().int().min(1).max(20).optional(),
		})
		.strict(),
	z
		.object({
			name: z.literal("sentry_get_release_commits"),
			limit: z.number().int().min(1).max(50).optional(),
		})
		.strict(),
] as const;
export const providerToolSchema = z
	.discriminatedUnion("name", providerToolSchemas)
	.refine(
		(tool) => !("startOffsetMinutes" in tool) || tool.endOffsetMinutes >= tool.startOffsetMinutes,
		"Invalid incident-relative window",
	)
	.refine(
		(tool) =>
			!("startOffsetMinutes" in tool) || tool.endOffsetMinutes - tool.startOffsetMinutes <= 120,
		"Maximum provider window is 120 minutes",
	);
export type ProviderToolRequest = z.infer<typeof providerToolSchema>;

export interface ModelToolDefinition {
	type: "function";
	function: { name: string; description: string; strict?: boolean; parameters: unknown };
}
export interface ProviderIncidentContext {
	incidentId: string;
	occurredAt: string;
	provider: ProviderKind;
	locator: Record<string, string>;
	release?: string;
}
export interface ProviderToolResult extends ToolResult {
	provider: ProviderKind;
	operation: string;
	locator: Record<string, string>;
	query?: string;
	windowStart?: string;
	windowEnd?: string;
}
export interface ConnectionTestResult {
	ok: boolean;
	capabilities: ProviderCapability[];
	errorCode?: string;
}
export interface ResolvedProviderConnection {
	id: string;
	organizationId: string;
	config: ProviderConnectionConfig;
	credential: ProviderCredential;
	capabilities: ProviderCapability[];
}

export interface InvestigationContextProvider {
	readonly provider: ProviderKind;
	testConnection(
		connection: ResolvedProviderConnection,
		signal?: AbortSignal,
	): Promise<ConnectionTestResult>;
	execute(
		connection: ResolvedProviderConnection,
		request: ProviderToolRequest,
		context: ProviderIncidentContext,
		signal?: AbortSignal,
	): Promise<ProviderToolResult>;
}

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
export interface RepositoryDownload {
	repositoryId: string;
	sha: string;
	url: string;
}
export interface SandboxRepositoryManifest {
	repositories: Array<{
		repositoryId: string;
		sha: string;
		downloadUrl: string;
	}>;
}
export type RepositoryPreparationProgress =
	| { phase: "downloading"; repositoryId: string; index: number; total: number }
	| { phase: "extracting"; repositoryId: string; index: number; total: number }
	| { phase: "ready"; repositoryCount: number; durationMs: number };
export interface SandboxHandle {
	id: string;
	createdAt: Date;
	metadata?: Record<string, string>;
}
export type InspectionOperation = Exclude<AgentTool, { name: "run_check" }>;
export type CheckRequest = Extract<AgentTool, { name: "run_check" }>;

export interface SandboxProvider {
	create(run: RunContext): Promise<SandboxHandle>;
	health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy">;
	prepareRepositories(
		handle: SandboxHandle,
		manifest: SandboxRepositoryManifest,
		incident: Uint8Array,
		onProgress?: (progress: RepositoryPreparationProgress) => void,
	): Promise<void>;
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
	createArchiveDownload(repositoryId: string, sha: string): Promise<RepositoryDownload>;
}
