import {
	MAX_NOTIFICATION_CITATIONS,
	type CallbackEvent,
	type Diagnosis,
	type NotificationCitation,
	type NotificationPayload,
} from "@legwork/contracts";
import { redactSecrets } from "@legwork/security";

export interface NotificationPayloadInput {
	event: CallbackEvent;
	status: "completed" | "inconclusive" | "failed";
	serviceName: string;
	incidentTitle: string;
	diagnosis: Diagnosis | null;
	dashboardUrl: string;
	completedAt: Date;
}

type Evidence = Diagnosis["evidence"][number];

/** Only evidence with file coordinates can be cited; command and provider evidence have none. */
function isFileEvidence(
	evidence: Evidence,
): evidence is Extract<Evidence, { path: string; lineStart: number; lineEnd: number }> {
	return "path" in evidence && "lineStart" in evidence && "lineEnd" in evidence;
}

function citations(diagnosis: Diagnosis | null): NotificationCitation[] {
	if (!diagnosis) return [];
	return diagnosis.evidence
		.filter(isFileEvidence)
		.slice(0, MAX_NOTIFICATION_CITATIONS)
		.map((evidence) => ({
			repositoryId: evidence.repositoryId,
			path: evidence.path,
			lineStart: evidence.lineStart,
			lineEnd: evidence.lineEnd,
		}));
}

export function buildNotificationPayload(input: NotificationPayloadInput): NotificationPayload {
	// The summary and root cause are model output derived from customer source
	// code; redact on the way out so a quoted secret never reaches a
	// third-party webhook or inbox.
	return redactSecrets({
		schemaVersion: "1",
		event: input.event,
		status: input.status,
		serviceName: input.serviceName,
		incidentTitle: input.incidentTitle,
		summary: input.diagnosis?.summary ?? null,
		rootCause: input.diagnosis?.rootCause
			? {
					statement: input.diagnosis.rootCause.statement,
					confidence: input.diagnosis.rootCause.confidence,
				}
			: null,
		citations: citations(input.diagnosis),
		dashboardUrl: input.dashboardUrl,
		completedAt: input.completedAt.toISOString(),
	});
}

export function buildTestPayload(appUrl: string): NotificationPayload {
	return {
		schemaVersion: "1",
		event: "notification.test",
		status: "test",
		serviceName: "Legwork",
		incidentTitle: "Test notification",
		summary: "If you can read this, this channel is wired up correctly.",
		rootCause: null,
		citations: [],
		dashboardUrl: `${appUrl.replace(/\/$/, "")}/notifications`,
		completedAt: new Date().toISOString(),
	};
}
