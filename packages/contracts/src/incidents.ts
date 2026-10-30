import { z } from "zod";
import { diagnosisSchema } from "./agent";

export const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_DIAGNOSTIC_TEXT_BYTES = 128 * 1024;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const incidentLogSchema = z
	.object({
		timestamp: z.string().datetime({ offset: true }).optional(),
		level: z.string().trim().max(32).optional(),
		message: z.string().max(MAX_DIAGNOSTIC_TEXT_BYTES),
	})
	.strict();

export const createIncidentRequestSchema = z
	.object({
		externalId: z.string().trim().min(1).max(255),
		title: z.string().trim().min(1).max(500),
		description: z.string().max(32_000).optional(),
		severity: z.enum(["critical", "high", "medium", "low", "unknown"]),
		occurredAt: z.string().datetime({ offset: true }),
		environment: z.string().trim().max(128).optional(),
		stackTrace: z.string().max(MAX_DIAGNOSTIC_TEXT_BYTES).optional(),
		logs: z.array(incidentLogSchema).max(2_000).optional(),
		primaryCommitSha: z
			.string()
			.regex(/^[0-9a-fA-F]{40}$/)
			.optional(),
		context: z
			.record(
				z.string().max(128),
				z.union([z.string().max(4_096), z.number(), z.boolean(), z.null()]),
			)
			.optional(),
	})
	.strict()
	.superRefine((input, context) => {
		const logText = input.logs?.map((entry) => entry.message).join("") ?? "";
		const size = utf8Bytes(input.stackTrace ?? "") + utf8Bytes(logText);
		if (size > MAX_DIAGNOSTIC_TEXT_BYTES) {
			context.addIssue({
				code: "custom",
				path: ["logs"],
				message: "Combined logs and stack trace exceed 128 KiB",
			});
		}
	});

export const createIncidentResponseSchema = z
	.object({
		incidentId: z.string().uuid(),
		runId: z.string().uuid(),
		status: z.literal("queued"),
		dashboardUrl: z.string().url(),
	})
	.strict();

export const serviceConnectionResponseSchema = z
	.object({
		status: z.literal("ready"),
		service: z
			.object({
				name: z.string(),
				slug: z.string(),
			})
			.strict(),
	})
	.strict();

export type CreateIncidentRequest = z.infer<typeof createIncidentRequestSchema>;
export type CreateIncidentResponse = z.infer<typeof createIncidentResponseSchema>;
export type ServiceConnectionResponse = z.infer<typeof serviceConnectionResponseSchema>;

export const runStatusSchema = z.enum([
	"queued",
	"provisioning",
	"analyzing",
	"completed",
	"inconclusive",
	"failed",
	"cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const incidentResultResponseSchema = z
	.object({
		incidentId: z.string().uuid(),
		externalId: z.string(),
		title: z.string(),
		severity: createIncidentRequestSchema.shape.severity,
		runId: z.string().uuid().nullable(),
		status: runStatusSchema.nullable(),
		failure: z
			.object({ code: z.string().nullable(), message: z.string().nullable() })
			.strict()
			.nullable(),
		diagnosis: diagnosisSchema.nullable(),
		dashboardUrl: z.string().url(),
		createdAt: z.string().datetime({ offset: true }),
		completedAt: z.string().datetime({ offset: true }).nullable(),
	})
	.strict();
export type IncidentResultResponse = z.infer<typeof incidentResultResponseSchema>;

export const terminalRunStatuses = ["completed", "inconclusive", "failed", "cancelled"] as const;
export function isTerminalRunStatus(status: RunStatus | null): boolean {
	return status !== null && (terminalRunStatuses as readonly string[]).includes(status);
}
