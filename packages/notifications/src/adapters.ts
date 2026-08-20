import type { NotificationChannelKind, NotificationPayload } from "@legwork/contracts";

export interface ResendConfig {
	apiKey: string;
	from: string;
}

export interface NotificationRequestInput {
	kind: NotificationChannelKind;
	destination: string;
	payload: NotificationPayload;
	email?: ResendConfig;
}

export interface NotificationRequest {
	url: URL;
	headers: Record<string, string>;
	body: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const headline: Record<NotificationPayload["status"], string> = {
	completed: "Diagnosis ready",
	inconclusive: "Analysis inconclusive",
	failed: "Analysis failed",
	test: "Test notification",
};

function citationLines(payload: NotificationPayload): string[] {
	return payload.citations.map(
		(citation) => `${citation.path}:${citation.lineStart}-${citation.lineEnd}`,
	);
}

function confidenceLabel(payload: NotificationPayload): string | null {
	if (!payload.rootCause) return null;
	return `${Math.round(payload.rootCause.confidence * 100)}% confidence`;
}

/** Shared plain-text rendering; every channel presents the same facts. */
function lines(payload: NotificationPayload): string[] {
	const parts = [`${headline[payload.status]} — ${payload.serviceName}`, payload.incidentTitle];
	if (payload.summary) parts.push("", payload.summary);
	if (payload.rootCause) {
		parts.push("", `Root cause: ${payload.rootCause.statement}`);
		const confidence = confidenceLabel(payload);
		if (confidence) parts.push(confidence);
	}
	const citations = citationLines(payload);
	if (citations.length > 0) parts.push("", "Evidence:", ...citations.map((line) => `• ${line}`));
	parts.push("", payload.dashboardUrl);
	return parts;
}

function slackBody(payload: NotificationPayload): string {
	const citations = citationLines(payload);
	const blocks: unknown[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: `${headline[payload.status]} — ${payload.serviceName}`.slice(0, 150),
			},
		},
		{
			type: "section",
			text: { type: "mrkdwn", text: `*${payload.incidentTitle}*` },
		},
	];
	if (payload.summary)
		blocks.push({ type: "section", text: { type: "mrkdwn", text: payload.summary } });
	if (payload.rootCause)
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Root cause* ${payload.rootCause.statement}\n_${confidenceLabel(payload)}_`,
			},
		});
	if (citations.length > 0)
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: `*Evidence*\n${citations.map((c) => `• \`${c}\``).join("\n")}`,
			},
		});
	blocks.push({
		type: "actions",
		elements: [
			{
				type: "button",
				text: { type: "plain_text", text: "Open in Legwork" },
				url: payload.dashboardUrl,
			},
		],
	});
	return JSON.stringify({ text: `${headline[payload.status]} — ${payload.serviceName}`, blocks });
}

function discordBody(payload: NotificationPayload): string {
	const citations = citationLines(payload);
	const fields: unknown[] = [];
	if (payload.rootCause)
		fields.push({
			name: "Root cause",
			value: `${payload.rootCause.statement}\n${confidenceLabel(payload)}`.slice(0, 1_024),
		});
	if (citations.length > 0)
		fields.push({ name: "Evidence", value: citations.join("\n").slice(0, 1_024) });
	return JSON.stringify({
		embeds: [
			{
				title: `${headline[payload.status]} — ${payload.serviceName}`.slice(0, 256),
				description: [payload.incidentTitle, payload.summary]
					.filter(Boolean)
					.join("\n\n")
					.slice(0, 4_096),
				url: payload.dashboardUrl,
				fields,
			},
		],
	});
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function emailBody(
	payload: NotificationPayload,
	destination: string,
	config: ResendConfig,
): string {
	const text = lines(payload).join("\n");
	const html = lines(payload)
		.map((line) => (line === "" ? "<br>" : `<p>${escapeHtml(line)}</p>`))
		.join("");
	return JSON.stringify({
		from: config.from,
		to: [destination],
		subject: `[${payload.serviceName}] ${headline[payload.status]}: ${payload.incidentTitle}`.slice(
			0,
			200,
		),
		text,
		html,
	});
}

export function buildNotificationRequest(input: NotificationRequestInput): NotificationRequest {
	if (input.kind === "email") {
		if (!input.email?.apiKey || !input.email.from)
			throw new Error("Resend is not configured; set RESEND_API_KEY and RESEND_FROM_ADDRESS");
		return {
			url: new URL(RESEND_ENDPOINT),
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${input.email.apiKey}`,
			},
			body: emailBody(input.payload, input.destination, input.email),
		};
	}
	return {
		url: new URL(input.destination),
		headers: { "content-type": "application/json" },
		body: input.kind === "slack" ? slackBody(input.payload) : discordBody(input.payload),
	};
}
