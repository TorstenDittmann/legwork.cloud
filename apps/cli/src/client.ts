import {
	createIncidentRequestSchema,
	createIncidentResponseSchema,
	problemDetailsSchema,
	serviceConnectionResponseSchema,
	type CreateIncidentRequest,
	type CreateIncidentResponse,
	type ServiceConnectionResponse,
} from "@legwork/contracts";
import type { LegworkConfig } from "./config";
import { CliError } from "./errors";

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "legwork-cli/0.1.0";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class LegworkClient {
	readonly #endpoint: string;

	constructor(
		private readonly config: LegworkConfig,
		private readonly fetchImplementation: Fetch = fetch,
	) {
		this.#endpoint = `${config.apiUrl}/api/v1/services/${encodeURIComponent(config.service)}/incidents`;
	}

	async checkService(): Promise<ServiceConnectionResponse> {
		const response = await this.#request("GET");
		const parsed = serviceConnectionResponseSchema.safeParse(await responseJson(response));
		if (!parsed.success) throw new CliError("Legwork returned an unexpected service response");
		return parsed.data;
	}

	async createIncident(
		request: CreateIncidentRequest,
		idempotencyKey: string,
	): Promise<CreateIncidentResponse> {
		const payload = createIncidentRequestSchema.parse(request);
		const response = await this.#request("POST", {
			body: JSON.stringify(payload),
			idempotencyKey,
		});
		const parsed = createIncidentResponseSchema.safeParse(await responseJson(response));
		if (!parsed.success)
			throw new CliError("Legwork accepted the request but returned an unexpected response");
		return parsed.data;
	}

	async #request(
		method: "GET" | "POST",
		options: { body?: string; idempotencyKey?: string } = {},
	): Promise<Response> {
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
			try {
				const response = await this.fetchImplementation(this.#endpoint, {
					method,
					signal: controller.signal,
					headers: {
						accept: "application/json, application/problem+json",
						authorization: `Bearer ${this.config.apiKey}`,
						"user-agent": USER_AGENT,
						...(options.body ? { "content-type": "application/json" } : {}),
						...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
					},
					...(options.body ? { body: options.body } : {}),
				});
				if (response.ok) return response;
				if (response.status >= 500 && attempt === 0) {
					await response.body?.cancel();
					continue;
				}
				throw await responseError(response);
			} catch (error) {
				if (error instanceof CliError) throw error;
				if (attempt === 0) continue;
				if (controller.signal.aborted)
					throw new CliError("Legwork did not respond within 15 seconds");
				throw new CliError(`Could not reach Legwork: ${errorMessage(error)}`);
			} finally {
				clearTimeout(timeout);
			}
		}
		throw new CliError("Could not reach Legwork");
	}
}

async function responseJson(response: Response): Promise<unknown> {
	try {
		return (await response.json()) as unknown;
	} catch {
		throw new CliError("Legwork returned a response that was not valid JSON");
	}
}

async function responseError(response: Response): Promise<CliError> {
	let body: unknown;
	try {
		body = (await response.json()) as unknown;
	} catch {
		return new CliError(`Legwork request failed with HTTP ${response.status}`);
	}
	const problem = problemDetailsSchema.safeParse(body);
	if (!problem.success) return new CliError(`Legwork request failed with HTTP ${response.status}`);
	const fieldErrors = problem.data.errors
		? Object.entries(problem.data.errors)
				.map(([field, messages]) => `${field}: ${messages.join(", ")}`)
				.join("; ")
		: undefined;
	return new CliError(
		[problem.data.title, problem.data.detail, fieldErrors].filter(Boolean).join(": "),
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
