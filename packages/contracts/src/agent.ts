import { z } from "zod";

const repositoryPath = z.string().min(1).max(2_048);
const repositoryId = z.string().min(1).max(128);
const evidenceLocatorValue = z.union([z.string().max(2_048), z.number().finite(), z.boolean()]);

export const agentToolSchema = z.discriminatedUnion("name", [
	z
		.object({
			name: z.literal("list_tree"),
			repositoryId,
			path: repositoryPath,
			depth: z.number().int().min(1).max(8),
		})
		.strict(),
	z
		.object({
			name: z.literal("search_code"),
			repositoryId,
			query: z.string().min(1).max(1_024),
			glob: z.string().max(256).optional(),
		})
		.strict(),
	z
		.object({
			name: z.literal("read_file"),
			repositoryId,
			path: repositoryPath,
			start: z.number().int().min(1),
			end: z.number().int().min(1).max(100_000),
		})
		.strict()
		.refine(
			(value) => value.end >= value.start && value.end - value.start <= 500,
			"Invalid line range",
		),
	z
		.object({
			name: z.literal("run_check"),
			repositoryId,
			check: z.enum(["test", "build", "lint", "typecheck"]),
		})
		.strict(),
]);

export type AgentTool = z.infer<typeof agentToolSchema>;

export const githubActivityToolSchema = z
	.object({
		name: z.literal("github_recent_activity"),
		repositoryId,
		lookbackHours: z.number().int().min(1).max(168),
	})
	.strict();
export type GitHubActivityTool = z.infer<typeof githubActivityToolSchema>;

export const toolResultSchema = z
	.object({
		status: z.enum(["ok", "error", "unavailable", "timed_out"]),
		output: z.string().max(65_536),
		truncated: z.boolean(),
		durationMs: z.number().int().nonnegative(),
		limitation: z.string().max(1_024).optional(),
	})
	.strict();
export type ToolResult = z.infer<typeof toolResultSchema>;

const evidenceBase = {
	repositoryId,
	excerpt: z.string().max(16_384),
	explanation: z.string().min(1).max(4_000),
};

export const diagnosisEvidenceSchema = z.union([
	z
		.object({
			...evidenceBase,
			path: repositoryPath,
			lineStart: z.number().int().min(1),
			lineEnd: z.number().int().min(1),
		})
		.strict()
		.refine((evidence) => evidence.lineEnd >= evidence.lineStart, {
			message: "lineEnd must be at least lineStart",
			path: ["lineEnd"],
		}),
	z
		.object({
			...evidenceBase,
			command: z.string().min(1).max(256),
		})
		.strict(),
	z
		.object({
			provider: z.enum(["grafana", "sentry", "github"]),
			sourceType: z.enum([
				"logs",
				"metrics",
				"traces",
				"issue",
				"event",
				"release",
				"actions",
				"deployments",
			]),
			operation: z.string().min(1).max(128),
			locator: z.record(z.string().max(128), evidenceLocatorValue),
			query: z.string().max(2_048).optional(),
			windowStart: z.string().datetime({ offset: true }).optional(),
			windowEnd: z.string().datetime({ offset: true }).optional(),
			excerpt: z.string().max(16_384),
			explanation: z.string().min(1).max(4_000),
		})
		.strict(),
]);

export const diagnosisSchema = z
	.object({
		schemaVersion: z.literal("1"),
		status: z.enum(["diagnosed", "inconclusive"]),
		title: z.string().min(1).max(500),
		summary: z.string().min(1).max(8_000),
		rootCause: z
			.object({
				statement: z.string().min(1).max(4_000),
				confidence: z.number().min(0).max(1),
			})
			.strict()
			.nullable(),
		evidence: z.array(diagnosisEvidenceSchema).max(50),
		suggestedFix: z
			.object({
				description: z.string().min(1).max(4_000),
				steps: z.array(z.string().min(1).max(2_000)).max(20),
				patch: z.string().max(32_000).optional(),
			})
			.strict()
			.nullable(),
		checksRun: z
			.array(
				z
					.object({
						name: z.string().min(1).max(128),
						status: z.enum(["passed", "failed", "unavailable", "timed_out"]),
						summary: z.string().max(2_000),
					})
					.strict(),
			)
			.max(20),
		limitations: z.array(z.string().max(2_000)).max(50),
	})
	.strict();

export type Diagnosis = z.infer<typeof diagnosisSchema>;
