import { z } from "zod";
import { callbackEventSchema } from "./callbacks";

export const notificationChannelKindSchema = z.enum(["slack", "discord", "email"]);
export type NotificationChannelKind = z.infer<typeof notificationChannelKindSchema>;

export const notificationChannelModeSchema = z.enum(["webhook", "resend"]);
export type NotificationChannelMode = z.infer<typeof notificationChannelModeSchema>;

/** Terminal analysis events a channel can subscribe to, plus the operator-triggered test. */
export const notificationEventSchema = z.enum([
	...callbackEventSchema.options,
	"notification.test",
]);
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export const notificationSubscriptionSchema = z.array(callbackEventSchema).min(1);

/**
 * A citation is a file coordinate only. There is deliberately no `excerpt` field: notification
 * destinations are third parties, so customer source code must not be renderable into a message.
 */
export const notificationCitationSchema = z
	.object({
		repositoryId: z.string().min(1),
		path: z.string().min(1),
		lineStart: z.number().int().min(1),
		lineEnd: z.number().int().min(1),
	})
	.strict();
export type NotificationCitation = z.infer<typeof notificationCitationSchema>;

export const MAX_NOTIFICATION_CITATIONS = 5;

export const notificationPayloadSchema = z
	.object({
		schemaVersion: z.literal("1"),
		event: notificationEventSchema,
		status: z.enum(["completed", "inconclusive", "failed", "test"]),
		serviceName: z.string(),
		incidentTitle: z.string(),
		summary: z.string().max(8_000).nullable(),
		rootCause: z
			.object({ statement: z.string().max(4_000), confidence: z.number().min(0).max(1) })
			.strict()
			.nullable(),
		citations: z.array(notificationCitationSchema).max(MAX_NOTIFICATION_CITATIONS),
		dashboardUrl: z.string().url(),
		completedAt: z.string().datetime({ offset: true }),
	})
	.strict();
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
