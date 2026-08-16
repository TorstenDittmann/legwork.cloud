import type { ProviderKind } from "@legwork/contracts";
import { assertSafeProviderUrl, boundedJson, IntegrationProviderError } from "./providers";

const MAX_DISCOVERED = 200;
const DATASOURCE_TYPES = ["loki", "prometheus", "tempo"] as const;
export type DiscoveredDatasourceType = (typeof DATASOURCE_TYPES)[number];
export interface DiscoveredGrafanaDatasource {
	uid: string;
	type: DiscoveredDatasourceType;
	name: string;
}
export interface DiscoveredSentryProject {
	organizationSlug: string;
	projectSlug: string;
	name: string;
}

function cloudHost(hostname: string, apex: string) {
	const host = hostname.toLowerCase();
	return host === apex || host.endsWith(`.${apex}`);
}
export function inferProviderMode(provider: ProviderKind, baseUrl: string) {
	let hostname: string;
	try {
		hostname = new URL(baseUrl).hostname;
	} catch {
		throw new IntegrationProviderError("PROVIDER_URL_UNSAFE");
	}
	if (provider === "grafana")
		return cloudHost(hostname, "grafana.net")
			? ("grafana_cloud" as const)
			: ("grafana_http" as const);
	return cloudHost(hostname, "sentry.io") ? ("sentry_cloud" as const) : ("sentry_http" as const);
}

function bounded(value: unknown, limit = 256) {
	return typeof value === "string" ? value.slice(0, limit) : "";
}
export function normalizeGrafanaDatasources(raw: unknown): DiscoveredGrafanaDatasource[] {
	if (!Array.isArray(raw)) throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
	return raw
		.flatMap((item) => {
			const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
			const uid = bounded(source.uid, 128);
			const type = DATASOURCE_TYPES.find((candidate) => candidate === source.type);
			return uid && type ? [{ uid, type, name: bounded(source.name) || uid }] : [];
		})
		.slice(0, MAX_DISCOVERED);
}
export function normalizeSentryProjects(raw: unknown): DiscoveredSentryProject[] {
	if (!Array.isArray(raw)) throw new IntegrationProviderError("PROVIDER_RESPONSE_INVALID");
	return raw
		.flatMap((item) => {
			const project = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
			const organization =
				project.organization && typeof project.organization === "object"
					? (project.organization as Record<string, unknown>)
					: {};
			const organizationSlug = bounded(organization.slug, 128);
			const projectSlug = bounded(project.slug, 128);
			return organizationSlug && projectSlug
				? [{ organizationSlug, projectSlug, name: bounded(project.name) || projectSlug }]
				: [];
		})
		.slice(0, MAX_DISCOVERED);
}

export async function discoverGrafanaDatasources(
	baseUrl: string,
	token: string,
	signal?: AbortSignal,
): Promise<DiscoveredGrafanaDatasource[]> {
	const base = await assertSafeProviderUrl(baseUrl);
	return normalizeGrafanaDatasources(
		await boundedJson(new URL("/api/datasources", base), token, signal),
	);
}
export async function discoverSentryProjects(
	baseUrl: string,
	token: string,
	signal?: AbortSignal,
): Promise<DiscoveredSentryProject[]> {
	const base = await assertSafeProviderUrl(baseUrl);
	return normalizeSentryProjects(
		await boundedJson(new URL("/api/0/projects/", base), token, signal),
	);
}
