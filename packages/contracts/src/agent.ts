import { z } from "zod";

const repositoryPath = z.string().min(1).max(2_048);
const repositoryId = z.string().min(1).max(128);

export const agentToolSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("list_tree"), repositoryId, path: repositoryPath, depth: z.number().int().min(1).max(8) }).strict(),
  z.object({ name: z.literal("search_code"), repositoryId, query: z.string().min(1).max(1_024), glob: z.string().max(256).optional() }).strict(),
  z.object({ name: z.literal("read_file"), repositoryId, path: repositoryPath, start: z.number().int().min(1), end: z.number().int().min(1).max(100_000) }).strict()
    .refine((value) => value.end >= value.start && value.end - value.start <= 500, "Invalid line range"),
  z.object({ name: z.literal("run_check"), repositoryId, check: z.enum(["test", "build", "lint", "typecheck"]) }).strict(),
]);

export type AgentTool = z.infer<typeof agentToolSchema>;

export const toolResultSchema = z.object({
  status: z.enum(["ok", "error", "unavailable", "timed_out"]),
  output: z.string().max(65_536),
  truncated: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  limitation: z.string().max(1_024).optional(),
}).strict();
export type ToolResult = z.infer<typeof toolResultSchema>;

export const diagnosisSchema = z.object({
  schemaVersion: z.literal("1"),
  status: z.enum(["diagnosed", "inconclusive"]),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(8_000),
  rootCause: z.object({
    statement: z.string().min(1).max(4_000),
    confidence: z.number().min(0).max(1),
  }).strict().nullable(),
  evidence: z.array(z.object({
    repositoryId,
    path: repositoryPath.optional(),
    lineStart: z.number().int().min(1).optional(),
    lineEnd: z.number().int().min(1).optional(),
    command: z.string().max(256).optional(),
    excerpt: z.string().max(16_384),
    explanation: z.string().min(1).max(4_000),
  }).strict().superRefine((evidence, context) => {
    if (evidence.path && (!evidence.lineStart || !evidence.lineEnd)) {
      context.addIssue({ code: "custom", message: "File evidence requires a complete line range" });
    }
    if (evidence.lineStart && evidence.lineEnd && evidence.lineEnd < evidence.lineStart) {
      context.addIssue({ code: "custom", message: "lineEnd must be at least lineStart" });
    }
    if (!evidence.path && !evidence.command) {
      context.addIssue({ code: "custom", message: "Evidence requires a path or command" });
    }
  })).max(50),
  suggestedFix: z.object({
    description: z.string().min(1).max(4_000),
    steps: z.array(z.string().min(1).max(2_000)).max(20),
    patch: z.string().max(32_000).optional(),
  }).strict().nullable(),
  checksRun: z.array(z.object({
    name: z.string().min(1).max(128),
    status: z.enum(["passed", "failed", "unavailable", "timed_out"]),
    summary: z.string().max(2_000),
  }).strict()).max(20),
  limitations: z.array(z.string().max(2_000)).max(50),
}).strict();

export type Diagnosis = z.infer<typeof diagnosisSchema>;
