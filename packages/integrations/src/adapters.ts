import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { NormalizedAlertEvent, ProviderKind } from "@legwork/contracts";

export const MAX_WEBHOOK_BYTES = 256 * 1024;
export class IntegrationError extends Error {
	constructor(
		readonly code: string,
		message = code,
	) {
		super(message);
		this.name = "IntegrationError";
	}
}
export interface AlertProviderAdapter {
	readonly provider: ProviderKind;
	verifyAndNormalize(input: {
		headers: Headers;
		rawBody: Uint8Array;
		secret: string;
		now: Date;
	}): Promise<NormalizedAlertEvent>;
}

function verify(rawBody: Uint8Array, secret: string, supplied: string | null) {
	if (!supplied) throw new IntegrationError("INTEGRATION_SIGNATURE_INVALID");
	const value = supplied.trim().replace(/^sha256=/i, "");
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	const left = Buffer.from(value, "hex");
	const right = Buffer.from(expected, "hex");
	if (left.length !== right.length || !timingSafeEqual(left, right))
		throw new IntegrationError("INTEGRATION_SIGNATURE_INVALID");
}
function parse(rawBody: Uint8Array): unknown {
	if (rawBody.byteLength > MAX_WEBHOOK_BYTES)
		throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
	try {
		return JSON.parse(new TextDecoder().decode(rawBody));
	} catch {
		throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
	}
}
const strings = z.record(z.string(), z.string()).default({});
const grafanaPayload = z
	.object({
		status: z.enum(["firing", "resolved"]),
		groupKey: z.string().min(1),
		groupLabels: strings.optional(),
		commonLabels: strings.optional(),
		commonAnnotations: strings.optional(),
		externalURL: z.string().url().optional(),
		alerts: z
			.array(
				z.object({
					status: z.enum(["firing", "resolved"]),
					labels: strings,
					annotations: strings,
					startsAt: z.string().datetime({ offset: true }),
					endsAt: z.string().datetime({ offset: true }).optional(),
					fingerprint: z.string().min(1),
					generatorURL: z.string().url().optional(),
					dashboardURL: z.string().url().optional(),
					panelURL: z.string().url().optional(),
				}),
			)
			.min(1)
			.max(200),
	})
	.passthrough();

function severity(value?: string): NormalizedAlertEvent["severity"] {
	switch (value?.toLowerCase()) {
		case "fatal":
		case "critical":
			return "critical";
		case "error":
		case "high":
			return "high";
		case "warning":
		case "warn":
		case "medium":
			return "medium";
		case "info":
		case "debug":
		case "low":
			return "low";
		default:
			return "unknown";
	}
}
function boundedStrings(value: unknown, limit = 30): Record<string, string> {
	if (!value || typeof value !== "object") return {};
	return Object.fromEntries(
		Object.entries(value)
			.filter((entry): entry is [string, string] => typeof entry[1] === "string")
			.slice(0, limit)
			.map(([key, item]) => [key.slice(0, 128), item.slice(0, 1_024)]),
	);
}

export const grafanaAlertAdapter: AlertProviderAdapter = {
	provider: "grafana",
	async verifyAndNormalize({ headers, rawBody, secret, now }) {
		verify(rawBody, secret, headers.get("x-grafana-alerting-signature"));
		const body = grafanaPayload.safeParse(parse(rawBody));
		if (!body.success) throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
		const alerts = body.data.alerts;
		const labels = { ...body.data.commonLabels, ...body.data.groupLabels };
		const annotations = body.data.commonAnnotations ?? {};
		const links = new Map<string, string>();
		if (body.data.externalURL) links.set("Grafana", body.data.externalURL);
		for (const alert of alerts)
			for (const [label, url] of [
				["Alert", alert.generatorURL],
				["Dashboard", alert.dashboardURL],
				["Panel", alert.panelURL],
			] as const)
				if (url) links.set(label, url);
		const starts = alerts.map((alert) => new Date(alert.startsAt).getTime());
		return {
			provider: "grafana",
			eventType: body.data.status,
			groupKey: body.data.groupKey,
			episodeStartedAt: new Date(Math.min(...starts)).toISOString(),
			...(body.data.status === "resolved" ? { endedAt: now.toISOString() } : {}),
			title: annotations.summary ?? labels.alertname ?? "Grafana alert group",
			...(annotations.description ? { description: annotations.description } : {}),
			severity: severity(labels.severity),
			...(labels.environment ? { environment: labels.environment } : {}),
			children: alerts.map((alert) => ({
				externalId: alert.fingerprint,
				status: alert.status,
				startedAt: new Date(alert.startsAt).toISOString(),
				...(alert.endsAt ? { endedAt: new Date(alert.endsAt).toISOString() } : {}),
				...(alert.annotations.summary ? { title: alert.annotations.summary } : {}),
				labels: boundedStrings(alert.labels),
				annotations: boundedStrings(alert.annotations),
			})),
			links: [...links].map(([label, url]) => ({ label, url })),
			context: boundedStrings(labels),
		};
	},
};

const sentryPayload = z
	.object({
		action: z.string().optional(),
		data: z.record(z.string(), z.unknown()).optional(),
		actor: z.unknown().optional(),
		installation: z.unknown().optional(),
	})
	.passthrough();
function fullSha(value: unknown) {
	return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
		? value.toLowerCase()
		: undefined;
}
export const sentryAlertAdapter: AlertProviderAdapter = {
	provider: "sentry",
	async verifyAndNormalize({ headers, rawBody, secret, now }) {
		verify(rawBody, secret, headers.get("sentry-hook-signature"));
		const parsed = sentryPayload.safeParse(parse(rawBody));
		if (!parsed.success) throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
		const resource = headers.get("sentry-hook-resource")?.toLowerCase();
		if (resource && resource !== "issue" && resource !== "event")
			throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
		const data = parsed.data.data ?? {};
		const issue = (data.issue ?? data.group ?? {}) as Record<string, unknown>;
		const event = (data.event ?? {}) as Record<string, unknown>;
		const issueId = String(issue.id ?? event.groupID ?? event.groupId ?? "");
		if (!issueId) throw new IntegrationError("INTEGRATION_PAYLOAD_INVALID");
		const action = parsed.data.action?.toLowerCase() ?? "created";
		const eventType = /resolved/.test(action) ? "resolved" : "firing";
		if (resource === "event" && !/alert|trigger/.test(action))
			throw new IntegrationError(
				"INTEGRATION_PAYLOAD_INVALID",
				"Raw event.created is not an incident trigger",
			);
		const tags = boundedStrings(
			event.tags && !Array.isArray(event.tags)
				? event.tags
				: Object.fromEntries(
						Array.isArray(event.tags) ? (event.tags as Array<[string, string]>).slice(0, 30) : [],
					),
		);
		const eventId = String(event.eventID ?? event.eventId ?? event.id ?? issueId);
		const timestamp = String(
			event.dateCreated ?? event.datetime ?? event.timestamp ?? now.toISOString(),
		);
		const project = (issue.project ?? event.project ?? {}) as Record<string, unknown>;
		const projectSlug = String(project.slug ?? event.projectSlug ?? "");
		const release =
			typeof event.release === "string"
				? event.release
				: typeof issue.release === "string"
					? issue.release
					: undefined;
		const title = String(issue.title ?? event.title ?? event.message ?? "Sentry issue").slice(
			0,
			500,
		);
		const context: Record<string, string | number | boolean | null> = {
			issueId,
			eventId,
			projectSlug,
			title,
		};
		const contextFields: Array<[string, unknown]> = [
			["shortId", issue.shortId],
			["platform", event.platform ?? issue.platform],
			["culprit", event.culprit ?? issue.culprit],
			["release", release],
			["transaction", event.transaction],
		];
		for (const [key, value] of contextFields)
			if (typeof value === "string") context[key] = value.slice(0, 1_024);
		const description =
			typeof event.message === "string"
				? event.message.slice(0, 2_000)
				: typeof issue.culprit === "string"
					? issue.culprit.slice(0, 2_000)
					: undefined;
		const environment =
			typeof event.environment === "string" ? event.environment : tags.environment;
		const primaryCommitSha = fullSha(tags.commit ?? tags.sha);
		return {
			provider: "sentry",
			eventType,
			groupKey: issueId,
			episodeStartedAt: new Date(timestamp).toISOString(),
			...(eventType === "resolved" ? { endedAt: now.toISOString() } : {}),
			title,
			...(description ? { description } : {}),
			severity: severity(String(event.level ?? issue.level ?? "")),
			...(environment ? { environment } : {}),
			...(primaryCommitSha ? { primaryCommitSha } : {}),
			children: [
				{
					externalId: eventId,
					status: eventType === "resolved" ? "resolved" : "firing",
					startedAt: new Date(timestamp).toISOString(),
					title,
					labels: tags,
					annotations: {},
				},
			],
			links: [
				["Issue", issue.permalink ?? issue.webUrl],
				["Event", event.webUrl],
			]
				.filter(
					(entry): entry is [string, string] =>
						typeof entry[1] === "string" && entry[1].startsWith("https://"),
				)
				.map(([label, url]) => ({ label, url })),
			context: { ...context, ...tags },
		};
	},
};

export const alertProviderAdapters: Record<ProviderKind, AlertProviderAdapter> = {
	grafana: grafanaAlertAdapter,
	sentry: sentryAlertAdapter,
};
