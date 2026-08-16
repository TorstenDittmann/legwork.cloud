import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Agent, fetch as pinnedFetch } from "undici";
import type {
	InvestigationContextProvider,
	ProviderCapability,
	ProviderIncidentContext,
	ProviderToolRequest,
	ResolvedProviderConnection,
} from "@legwork/contracts";
import { redactSecrets } from "@legwork/security";

const MAX_OUTPUT = 64 * 1024;
function unsafeAddress(address: string) {
	if (isIP(address) === 4) {
		const [a = 0, b = 0] = address.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 198 && (b === 18 || b === 19))
		);
	}
	const normalized = address.toLowerCase();
	return (
		normalized === "::" ||
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe8") ||
		normalized.startsWith("fe9") ||
		normalized.startsWith("fea") ||
		normalized.startsWith("feb") ||
		normalized.startsWith("ff") ||
		normalized.startsWith("::ffff:")
	);
}
export async function assertSafeProviderUrl(value: string) {
	return (await resolveSafeProviderUrl(value)).url;
}
async function resolveSafeProviderUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new IntegrationProviderError("PROVIDER_URL_UNSAFE");
	}
	if (url.protocol !== "https:" || url.username || url.password || url.port)
		throw new IntegrationProviderError("PROVIDER_URL_UNSAFE");
	const addresses = await lookup(url.hostname, { all: true });
	if (!addresses.length || addresses.some(({ address }) => unsafeAddress(address)))
		throw new IntegrationProviderError("PROVIDER_URL_UNSAFE");
	return { url, address: addresses[0]! };
}
export class IntegrationProviderError extends Error {
	constructor(
		readonly code: string,
		readonly retryable = false,
	) {
		super(code);
		this.name = "IntegrationProviderError";
	}
}
export async function boundedJson(url: URL, token: string, signal?: AbortSignal) {
	const resolved = await resolveSafeProviderUrl(url.origin);
	const dispatcher = new Agent({
		connect: {
			lookup: (_hostname, _options, callback) =>
				callback(null, resolved.address.address, resolved.address.family),
		},
	});
	try {
		const response = await pinnedFetch(url, {
			dispatcher,
			headers: { authorization: `Bearer ${token}`, accept: "application/json" },
			redirect: "error",
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
				: AbortSignal.timeout(20_000),
		});
		if (response.status === 401)
			throw new IntegrationProviderError("PROVIDER_AUTHENTICATION_FAILED");
		if (response.status === 403) throw new IntegrationProviderError("PROVIDER_PERMISSION_DENIED");
		if (response.status === 429) throw new IntegrationProviderError("PROVIDER_RATE_LIMITED", true);
		if (response.status >= 500) throw new IntegrationProviderError("PROVIDER_UNAVAILABLE", true);
		if (!response.ok) throw new IntegrationProviderError("PROVIDER_QUERY_INVALID");
		const reader = response.body?.getReader();
		if (!reader) throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
		const chunks: Uint8Array[] = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 1024 * 1024) {
				await reader.cancel();
				throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
			}
			chunks.push(value);
		}
		try {
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.length;
			}
			return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		} catch {
			throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
		}
	} finally {
		await dispatcher.close();
	}
}
function output(value: unknown) {
	const serialized = JSON.stringify(redactSecrets(value));
	const bytes = Buffer.from(serialized);
	return {
		output: bytes.subarray(0, MAX_OUTPUT).toString("utf8"),
		truncated: bytes.length > MAX_OUTPUT,
	};
}
function token(connection: ResolvedProviderConnection) {
	const credential = connection.credential;
	return credential.provider === "sentry"
		? credential.apiToken
		: credential.mode === "grafana_cloud"
			? credential.accessPolicyToken
			: credential.serviceAccountToken;
}
function window(
	context: ProviderIncidentContext,
	request: Extract<ProviderToolRequest, { startOffsetMinutes: number }>,
) {
	const occurrence = new Date(context.occurredAt).getTime();
	return {
		start: new Date(occurrence + request.startOffsetMinutes * 60_000),
		end: new Date(occurrence + request.endOffsetMinutes * 60_000),
	};
}
function normalizeGrafana(kind: "logs" | "metrics" | "traces", raw: unknown) {
	const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const data =
		root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
	const result = Array.isArray(data.result) ? (data.result as Array<Record<string, unknown>>) : [];
	if (kind === "logs")
		return result
			.flatMap((stream) =>
				Array.isArray(stream.values)
					? (stream.values as unknown[])
							.slice(0, 200)
							.map((value) => ({ labels: stream.stream, value }))
					: [],
			)
			.slice(0, 200);
	if (kind === "metrics") {
		let remaining = 1_000;
		return result.slice(0, 20).map((series) => {
			const values = Array.isArray(series.values) ? series.values.slice(0, remaining) : [];
			remaining -= values.length;
			return { metric: series.metric, values };
		});
	}
	const traces = Array.isArray(root.traces)
		? root.traces
		: Array.isArray(data.traces)
			? data.traces
			: result;
	return traces.slice(0, 20).map((item) => {
		const trace = item as Record<string, unknown>;
		return {
			traceId: trace.traceID ?? trace.traceId,
			rootServiceName: trace.rootServiceName,
			rootTraceName: trace.rootTraceName,
			startTimeUnixNano: trace.startTimeUnixNano,
			durationMs: trace.durationMs,
			spanCount: Array.isArray(trace.spans) ? trace.spans.length : trace.spanCount,
		};
	});
}
export const grafanaContextProvider: InvestigationContextProvider = {
	provider: "grafana",
	async testConnection(connection, signal) {
		try {
			const config = connection.config;
			if (config.provider !== "grafana")
				return { ok: false, capabilities: [], errorCode: "PROVIDER_RESPONSE_INVALID" };
			const base = await assertSafeProviderUrl(config.grafanaUrl);
			await boundedJson(new URL("/api/health", base), token(connection), signal);
			return {
				ok: true,
				capabilities: connection.capabilities.filter((item): item is ProviderCapability =>
					["logs", "metrics", "traces"].includes(item),
				),
			};
		} catch (error) {
			return {
				ok: false,
				capabilities: [],
				errorCode: error instanceof IntegrationProviderError ? error.code : "PROVIDER_UNAVAILABLE",
			};
		}
	},
	async execute(connection, request, context, signal) {
		if (!request.name.startsWith("grafana_"))
			throw new IntegrationProviderError("PROVIDER_QUERY_INVALID");
		const grafanaRequest = request as Extract<ProviderToolRequest, { startOffsetMinutes: number }>;
		const config = connection.config;
		if (config.provider !== "grafana")
			throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
		const kind =
			request.name === "grafana_query_logs"
				? "logs"
				: request.name === "grafana_query_metrics"
					? "metrics"
					: "traces";
		const source = config[kind];
		if (!source || !connection.capabilities.includes(kind))
			throw new IntegrationProviderError("PROVIDER_PERMISSION_DENIED");
		const range = window(context, grafanaRequest);
		const url = new URL(
			`/api/datasources/proxy/uid/${encodeURIComponent(source.uid)}/api/v1/query_range`,
			config.grafanaUrl,
		);
		url.searchParams.set("query", grafanaRequest.query);
		url.searchParams.set("start", String(range.start.getTime() * 1_000_000));
		url.searchParams.set("end", String(range.end.getTime() * 1_000_000));
		if (grafanaRequest.name === "grafana_query_metrics")
			url.searchParams.set("step", String(grafanaRequest.stepSeconds ?? 60));
		else
			url.searchParams.set("limit", String(grafanaRequest.limit ?? (kind === "logs" ? 200 : 20)));
		const normalized = output(
			normalizeGrafana(kind, await boundedJson(url, token(connection), signal)),
		);
		return {
			provider: "grafana",
			operation: grafanaRequest.name,
			locator: { dataSourceUid: source.uid },
			query: grafanaRequest.query,
			windowStart: range.start.toISOString(),
			windowEnd: range.end.toISOString(),
			status: "ok",
			durationMs: 0,
			...normalized,
		};
	},
};

function normalizeEvent(raw: unknown) {
	const event = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const entries = Array.isArray(event.entries)
		? (event.entries as Array<Record<string, unknown>>)
		: [];
	const exceptions = entries
		.filter((entry) => entry.type === "exception")
		.flatMap(
			(entry) =>
				((entry.data as Record<string, unknown> | undefined)?.values as
					| Array<Record<string, unknown>>
					| undefined) ?? [],
		)
		.slice(0, 20)
		.map((exception) => {
			const frames = (
				((exception.stacktrace as Record<string, unknown> | undefined)?.frames as
					| Array<Record<string, unknown>>
					| undefined) ?? []
			).filter((frame) => frame.inApp === true);
			const selected = (
				frames.length
					? frames
					: (((exception.stacktrace as Record<string, unknown> | undefined)?.frames as
							| Array<Record<string, unknown>>
							| undefined) ?? [])
			).slice(-100);
			return {
				type: exception.type,
				value: exception.value,
				mechanism: (exception.mechanism as Record<string, unknown> | undefined)?.type,
				stacktrace: selected.map((frame) => ({
					filename: frame.filename,
					function: frame.function,
					module: frame.module,
					contextLine: frame.contextLine,
					lineNo: frame.lineNo,
					colNo: frame.colNo,
					preContext: Array.isArray(frame.preContext) ? frame.preContext.slice(-2) : undefined,
					postContext: Array.isArray(frame.postContext) ? frame.postContext.slice(0, 2) : undefined,
				})),
			};
		});
	return {
		eventId: event.eventID ?? event.id,
		timestamp: event.dateCreated,
		title: event.title,
		message: event.message,
		platform: event.platform,
		environment: event.environment,
		release:
			typeof event.release === "object"
				? (event.release as Record<string, unknown>).version
				: event.release,
		transaction: event.transaction,
		exceptions,
		tags: Array.isArray(event.tags)
			? Object.fromEntries(
					(event.tags as Array<{ key: string; value: string }>)
						.slice(0, 30)
						.map((tag) => [tag.key, tag.value]),
				)
			: {},
	};
}
function normalizeIssue(raw: unknown, projectSlug: string) {
	const issue = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const metadata =
		issue.metadata && typeof issue.metadata === "object"
			? (issue.metadata as Record<string, unknown>)
			: {};
	const tags = Array.isArray(issue.tags)
		? Object.fromEntries(
				(issue.tags as Array<Record<string, unknown>>)
					.slice(0, 30)
					.flatMap((tag) =>
						typeof tag.key === "string" &&
						(typeof tag.value === "string" || typeof tag.name === "string")
							? [[tag.key, String(tag.value ?? tag.name).slice(0, 1_024)]]
							: [],
					),
			)
		: {};
	return {
		issueId: issue.id,
		shortId: issue.shortId,
		title: issue.title,
		culprit: issue.culprit,
		level: issue.level,
		status: issue.status,
		firstSeen: issue.firstSeen,
		lastSeen: issue.lastSeen,
		count: typeof issue.count === "string" ? Number(issue.count) : issue.count,
		platform: issue.platform,
		projectSlug,
		release: metadata.value ?? tags.release,
		tags,
	};
}
export const sentryContextProvider: InvestigationContextProvider = {
	provider: "sentry",
	async testConnection(connection, signal) {
		try {
			const config = connection.config;
			if (config.provider !== "sentry")
				return { ok: false, capabilities: [], errorCode: "PROVIDER_RESPONSE_INVALID" };
			await boundedJson(
				new URL(
					`/api/0/projects/${encodeURIComponent(config.organizationSlug)}/${encodeURIComponent(config.projectSlug)}/`,
					config.sentryUrl,
				),
				token(connection),
				signal,
			);
			return {
				ok: true,
				capabilities: connection.capabilities.filter((item): item is ProviderCapability =>
					["issues", "events", "releases"].includes(item),
				),
			};
		} catch (error) {
			return {
				ok: false,
				capabilities: [],
				errorCode: error instanceof IntegrationProviderError ? error.code : "PROVIDER_UNAVAILABLE",
			};
		}
	},
	async execute(connection, request, context, signal) {
		if (!request.name.startsWith("sentry_"))
			throw new IntegrationProviderError("PROVIDER_QUERY_INVALID");
		const config = connection.config;
		if (config.provider !== "sentry")
			throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
		const issueId = context.locator.issueId;
		if (!issueId) throw new IntegrationProviderError("PROVIDER_QUERY_INVALID");
		let url: URL;
		let capability: ProviderCapability = "events";
		if (request.name === "sentry_get_issue") {
			capability = "issues";
			url = new URL(`/api/0/issues/${encodeURIComponent(issueId)}/`, config.sentryUrl);
		} else if (request.name === "sentry_get_event")
			url = new URL(
				`/api/0/issues/${encodeURIComponent(issueId)}/events/${request.selection}/`,
				config.sentryUrl,
			);
		else if (request.name === "sentry_list_events") {
			url = new URL(`/api/0/issues/${encodeURIComponent(issueId)}/events/`, config.sentryUrl);
			url.searchParams.set("limit", String(request.limit ?? 20));
			if (request.query) url.searchParams.set("query", request.query);
		} else {
			capability = "releases";
			if (!context.release) throw new IntegrationProviderError("PROVIDER_QUERY_INVALID");
			url = new URL(
				`/api/0/projects/${encodeURIComponent(config.organizationSlug)}/${encodeURIComponent(config.projectSlug)}/releases/${encodeURIComponent(context.release)}/commits/`,
				config.sentryUrl,
			);
			url.searchParams.set("per_page", String("limit" in request ? (request.limit ?? 50) : 50));
		}
		if (!connection.capabilities.includes(capability))
			throw new IntegrationProviderError("PROVIDER_PERMISSION_DENIED");
		const raw = await boundedJson(url, token(connection), signal);
		const normalized =
			request.name === "sentry_get_issue"
				? normalizeIssue(raw, config.projectSlug)
				: request.name === "sentry_get_event"
					? normalizeEvent(raw)
					: request.name === "sentry_list_events" && Array.isArray(raw)
						? raw.slice(0, request.limit ?? 20).map(normalizeEvent)
						: request.name === "sentry_get_release_commits" && Array.isArray(raw)
							? raw.slice(0, request.limit ?? 50).map((item) => {
									const value = item as Record<string, unknown>;
									return {
										id: value.id,
										message: value.message,
										dateCreated: value.dateCreated,
										pullRequest: value.pullRequest,
									};
								})
							: raw;
		const bounded = output(normalized);
		return {
			provider: "sentry",
			operation: request.name,
			locator: { issueId, ...(context.release ? { release: context.release } : {}) },
			status: "ok",
			durationMs: 0,
			...bounded,
		};
	},
};
export const investigationContextProviders = {
	grafana: grafanaContextProvider,
	sentry: sentryContextProvider,
} as const;
