import { describe, expect, it } from "vitest";
import {
	inferProviderMode,
	normalizeGrafanaDatasources,
	normalizeSentryProjects,
} from "./discovery";

describe("inferProviderMode", () => {
	it("detects Grafana Cloud stacks", () => {
		expect(inferProviderMode("grafana", "https://example.grafana.net")).toBe("grafana_cloud");
		expect(inferProviderMode("grafana", "https://grafana.example.com")).toBe("grafana_http");
	});
	it("detects Sentry Cloud", () => {
		expect(inferProviderMode("sentry", "https://sentry.io")).toBe("sentry_cloud");
		expect(inferProviderMode("sentry", "https://acme.sentry.io")).toBe("sentry_cloud");
		expect(inferProviderMode("sentry", "https://sentry.example.com")).toBe("sentry_http");
	});
	it("rejects lookalike hosts", () => {
		expect(inferProviderMode("grafana", "https://evilgrafana.net")).toBe("grafana_http");
		expect(inferProviderMode("sentry", "https://notsentry.io")).toBe("sentry_http");
	});
	it("rejects unparsable URLs", () => {
		expect(() => inferProviderMode("grafana", "not a url")).toThrow("PROVIDER_URL_UNSAFE");
	});
});

describe("normalizeGrafanaDatasources", () => {
	it("keeps only queryable observability datasources", () => {
		const result = normalizeGrafanaDatasources([
			{ uid: "loki-1", type: "loki", name: "Logs" },
			{ uid: "prom-1", type: "prometheus", name: "Metrics" },
			{ uid: "tempo-1", type: "tempo", name: "Traces" },
			{ uid: "pg-1", type: "postgres", name: "Database" },
			{ type: "loki", name: "missing uid" },
			"garbage",
		]);
		expect(result).toEqual([
			{ uid: "loki-1", type: "loki", name: "Logs" },
			{ uid: "prom-1", type: "prometheus", name: "Metrics" },
			{ uid: "tempo-1", type: "tempo", name: "Traces" },
		]);
	});
	it("falls back to the uid when a name is missing and bounds the list", () => {
		const many = Array.from({ length: 250 }, (_, index) => ({
			uid: `loki-${index}`,
			type: "loki",
		}));
		const result = normalizeGrafanaDatasources(many);
		expect(result).toHaveLength(200);
		expect(result[0]).toEqual({ uid: "loki-0", type: "loki", name: "loki-0" });
	});
	it("rejects non-array payloads", () => {
		expect(() => normalizeGrafanaDatasources({ datasources: [] })).toThrow(
			"PROVIDER_RESPONSE_INVALID",
		);
	});
});

describe("normalizeSentryProjects", () => {
	it("maps organization and project slugs", () => {
		const result = normalizeSentryProjects([
			{ slug: "backend", name: "Backend", organization: { slug: "acme" } },
			{ slug: "orphan", name: "No organization" },
			{ organization: { slug: "acme" } },
		]);
		expect(result).toEqual([{ organizationSlug: "acme", projectSlug: "backend", name: "Backend" }]);
	});
	it("bounds the list and slug lengths", () => {
		const many = Array.from({ length: 250 }, (_, index) => ({
			slug: `project-${index}`,
			organization: { slug: "x".repeat(200) },
		}));
		const result = normalizeSentryProjects(many);
		expect(result).toHaveLength(200);
		expect(result[0]!.organizationSlug).toHaveLength(128);
		expect(result[0]!.name).toBe("project-0");
	});
	it("rejects non-array payloads", () => {
		expect(() => normalizeSentryProjects(null)).toThrow("PROVIDER_RESPONSE_INVALID");
	});
});
