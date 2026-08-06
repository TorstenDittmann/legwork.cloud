import { z } from "zod";

export const callbackEventSchema = z.enum([
	"analysis.completed",
	"analysis.inconclusive",
	"analysis.failed",
]);

export const callbackPayloadSchema = z
	.object({
		schemaVersion: z.literal("1"),
		event: callbackEventSchema,
		incidentId: z.string().uuid(),
		runId: z.string().uuid(),
		status: z.enum(["completed", "inconclusive", "failed"]),
		summary: z.string().max(8_000).nullable(),
		confidence: z.number().min(0).max(1).nullable(),
		dashboardUrl: z.string().url(),
		completedAt: z.string().datetime({ offset: true }),
	})
	.strict();

export type CallbackEvent = z.infer<typeof callbackEventSchema>;
export type CallbackPayload = z.infer<typeof callbackPayloadSchema>;
