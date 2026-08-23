import { createHash, randomUUID } from "node:crypto";
import {
	createIncidentRequestSchema,
	MAX_IDEMPOTENCY_KEY_LENGTH,
	type CreateIncidentRequest,
} from "@legwork/contracts";
import { UsageError } from "./errors";

type Environment = Record<string, string | undefined>;

export function parseContext(values: string[]): Record<string, string> {
	const context = Object.create(null) as Record<string, string>;
	for (const entry of values) {
		const separator = entry.indexOf("=");
		if (separator < 1) throw new UsageError(`Context must use key=value syntax: ${entry}`);
		const key = entry.slice(0, separator).trim();
		const value = entry.slice(separator + 1);
		if (!key || key.length > 128)
			throw new UsageError("Context keys must contain between 1 and 128 characters");
		if (new TextEncoder().encode(value).byteLength > 4_096)
			throw new UsageError(`Context value for ${key} exceeds 4 KiB`);
		context[key] = value;
	}
	return context;
}

export function inferredContext(environment: Environment = process.env): Record<string, string> {
	const context = Object.create(null) as Record<string, string>;
	add(context, "ci.provider", environment.GITHUB_ACTIONS === "true" ? "github-actions" : undefined);
	add(context, "ci.run_id", environment.GITHUB_RUN_ID);
	add(context, "ci.run_attempt", environment.GITHUB_RUN_ATTEMPT);
	add(context, "ci.workflow", environment.GITHUB_WORKFLOW);
	add(context, "ci.job", environment.GITHUB_JOB);
	add(context, "repository", environment.GITHUB_REPOSITORY);
	add(context, "railway.project_id", environment.RAILWAY_PROJECT_ID);
	add(context, "railway.environment", environment.RAILWAY_ENVIRONMENT_NAME);
	add(context, "railway.service", environment.RAILWAY_SERVICE_NAME);
	add(context, "railway.deployment_id", environment.RAILWAY_DEPLOYMENT_ID);
	return context;
}

export function inferEnvironment(environment: Environment = process.env): string | undefined {
	return (
		environment.LEGWORK_ENVIRONMENT ?? environment.RAILWAY_ENVIRONMENT_NAME ?? environment.NODE_ENV
	);
}

export function inferCommitSha(environment: Environment = process.env): string | undefined {
	const value = environment.GITHUB_SHA ?? environment.RAILWAY_GIT_COMMIT_SHA;
	return value && /^[0-9a-fA-F]{40}$/.test(value) ? value : undefined;
}

export function inferExternalId(
	environment: Environment = process.env,
	uniqueId: string = randomUUID(),
): string {
	if (environment.GITHUB_RUN_ID) {
		const attempt = environment.GITHUB_RUN_ATTEMPT ?? "1";
		const job = environment.GITHUB_JOB ?? "job";
		return `github-actions:${environment.GITHUB_RUN_ID}:${attempt}:${job}:${uniqueId}`;
	}
	if (environment.RAILWAY_DEPLOYMENT_ID)
		return `railway:${environment.RAILWAY_DEPLOYMENT_ID}:${uniqueId}`;
	return `cli:${uniqueId}`;
}

export function createIdempotencyKey(service: string, externalId: string): string {
	return `cli-${createHash("sha256").update(`${service}\0${externalId}`).digest("hex")}`;
}

export function validateIdempotencyKey(value: string): string {
	const key = value.trim();
	if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH)
		throw new UsageError("Idempotency key must contain between 1 and 128 characters");
	return key;
}

export function parseIncidentPayload(value: unknown): CreateIncidentRequest {
	const parsed = createIncidentRequestSchema.safeParse(value);
	if (parsed.success) return parsed.data;
	const issues = parsed.error.issues
		.slice(0, 4)
		.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
		.join("; ");
	throw new UsageError(`Invalid incident payload: ${issues}`);
}

function add(target: Record<string, string>, key: string, value: string | undefined): void {
	if (value) target[key] = value.slice(0, 4_096);
}
