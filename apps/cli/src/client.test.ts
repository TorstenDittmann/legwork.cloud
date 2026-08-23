import { describe, expect, it, vi } from "vitest";
import type { LegworkConfig } from "./config";
import { LegworkClient } from "./client";

const config: LegworkConfig = {
	apiUrl: "https://legwork.example",
	service: "payments-api",
	apiKey: `ocai_live_${"a".repeat(43)}`,
};

const incident = {
	externalId: "deploy-42",
	title: "Deployment failed",
	severity: "high" as const,
	occurredAt: "2026-08-23T12:00:00.000Z",
};

const queued = {
	incidentId: "c3e95ed0-09e8-42e4-81bc-818332ea0d42",
	runId: "a6d0ee4f-7db9-46ef-9839-3fd71632b419",
	status: "queued",
	dashboardUrl: "https://legwork.example/incidents/c3e95ed0-09e8-42e4-81bc-818332ea0d42",
};

describe("LegworkClient", () => {
	it("checks the configured service with bearer authentication", async () => {
		const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
		const fetchImplementation = async (input: string, init?: RequestInit) => {
			requests.push({ input, ...(init ? { init } : {}) });
			return Response.json({
				status: "ready",
				service: { name: "Payments API", slug: "payments-api" },
			});
		};

		await expect(
			new LegworkClient(config, fetchImplementation).checkService(),
		).resolves.toMatchObject({
			status: "ready",
			service: { slug: "payments-api" },
		});
		expect(String(requests[0]?.input)).toBe(
			"https://legwork.example/api/v1/services/payments-api/incidents",
		);
		expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
			`Bearer ${config.apiKey}`,
		);
	});

	it("posts a validated incident with a stable idempotency key", async () => {
		let request: RequestInit | undefined;
		const fetchImplementation = async (_input: string, init?: RequestInit) => {
			request = init;
			return Response.json(queued, { status: 202 });
		};

		await expect(
			new LegworkClient(config, fetchImplementation).createIncident(incident, "cli-stable-key"),
		).resolves.toEqual(queued);
		expect(request?.method).toBe("POST");
		expect(new Headers(request?.headers).get("idempotency-key")).toBe("cli-stable-key");
		expect(JSON.parse(String(request?.body))).toMatchObject(incident);
	});

	it("surfaces RFC problem details without exposing credentials", async () => {
		const fetchImplementation = async () =>
			Response.json(
				{
					type: "https://legwork.dev/problems/unauthorized",
					title: "Unauthorized",
					status: 401,
					detail: "The ingestion key is invalid",
				},
				{ status: 401 },
			);

		await expect(new LegworkClient(config, fetchImplementation).checkService()).rejects.toThrow(
			"Unauthorized: The ingestion key is invalid",
		);
	});

	it("retries a transient server failure once", async () => {
		const fetchImplementation = vi
			.fn<(input: string, init?: RequestInit) => Promise<Response>>()
			.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
			.mockResolvedValueOnce(Response.json(queued, { status: 202 }));

		await new LegworkClient(config, fetchImplementation).createIncident(incident, "cli-stable-key");
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
	});
});
