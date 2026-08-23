import type { CreateIncidentRequest } from "@legwork/contracts";
import { UsageError } from "./errors";

type Severity = CreateIncidentRequest["severity"];

interface ConnectionOptions {
	apiUrl?: string;
	service?: string;
	apiKey?: string;
}

export type CliCommand =
	| { kind: "help"; topic?: string }
	| { kind: "version" }
	| ({
			kind: "configure";
			apiKeyStdin: boolean;
			noVerify: boolean;
			json: boolean;
			help: boolean;
	  } & ConnectionOptions)
	| ({ kind: "doctor"; json: boolean; help: boolean } & ConnectionOptions)
	| ({
			kind: "incident";
			title?: string;
			severity?: Severity;
			description?: string;
			environment?: string;
			externalId?: string;
			occurredAt?: string;
			commitSha?: string;
			stackTraceFile?: string;
			payloadFile?: string;
			idempotencyKey?: string;
			context: string[];
			stdin: boolean;
			json: boolean;
			help: boolean;
	  } & ConnectionOptions)
	| ({
			kind: "run";
			title?: string;
			severity?: Severity;
			description?: string;
			environment?: string;
			externalId?: string;
			commitSha?: string;
			idempotencyKey?: string;
			context: string[];
			command: string[];
			help: boolean;
	  } & ConnectionOptions);

type OptionKind = "boolean" | "value" | "multi";
interface OptionSpec {
	key: string;
	kind: OptionKind;
}

const commonSpecs: Record<string, OptionSpec> = {
	"--url": { key: "apiUrl", kind: "value" },
	"--service": { key: "service", kind: "value" },
	"--api-key": { key: "apiKey", kind: "value" },
	"--help": { key: "help", kind: "boolean" },
	"-h": { key: "help", kind: "boolean" },
};

interface ParsedOptions {
	values: Map<string, string[]>;
	rest: string[];
	foundDelimiter: boolean;
}

function parseOptions(args: string[], specs: Record<string, OptionSpec>): ParsedOptions {
	const values = new Map<string, string[]>();
	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (token === "--") {
			return { values, rest: args.slice(index + 1), foundDelimiter: true };
		}
		if (!token?.startsWith("-")) throw new UsageError(`Unexpected argument: ${token}`);

		const separator = token.indexOf("=");
		const name = separator === -1 ? token : token.slice(0, separator);
		const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
		const spec = specs[name];
		if (!spec) throw new UsageError(`Unknown option: ${name}`);
		if (spec.kind === "boolean") {
			if (inlineValue !== undefined) throw new UsageError(`${name} does not accept a value`);
			values.set(spec.key, ["true"]);
			continue;
		}

		const value = inlineValue ?? args[index + 1];
		if (value === undefined || value === "" || (inlineValue === undefined && specs[value]))
			throw new UsageError(`${name} requires a value`);
		if (inlineValue === undefined) index += 1;
		const existing = values.get(spec.key) ?? [];
		if (spec.kind === "value" && existing.length > 0)
			throw new UsageError(`${name} may only be provided once`);
		values.set(spec.key, [...existing, value]);
	}
	return { values, rest: [], foundDelimiter: false };
}

function rejectTrailingArguments(parsed: ParsedOptions): void {
	if (parsed.foundDelimiter || parsed.rest.length > 0)
		throw new UsageError("Unexpected --; this command does not run a child command");
}

const one = (values: Map<string, string[]>, key: string) => values.get(key)?.[0];
const has = (values: Map<string, string[]>, key: string) => values.has(key);
const many = (values: Map<string, string[]>, key: string) => values.get(key) ?? [];

function connection(values: Map<string, string[]>): ConnectionOptions {
	const apiUrl = one(values, "apiUrl");
	const service = one(values, "service");
	const apiKey = one(values, "apiKey");
	return {
		...(apiUrl ? { apiUrl } : {}),
		...(service ? { service } : {}),
		...(apiKey ? { apiKey } : {}),
	};
}

function severity(values: Map<string, string[]>): Severity | undefined {
	const value = one(values, "severity");
	if (value === undefined) return undefined;
	if (!["critical", "high", "medium", "low", "unknown"].includes(value))
		throw new UsageError(`Invalid severity: ${value}`);
	return value as Severity;
}

export function parseCliArgs(args: string[]): CliCommand {
	const [name, ...rest] = args;
	if (!name || name === "--help" || name === "-h") return { kind: "help" };
	if (name === "--version" || name === "-V" || name === "version") {
		if (rest.length > 0) throw new UsageError("version does not accept arguments");
		return { kind: "version" };
	}
	if (name === "help") {
		if (rest.length > 1) throw new UsageError("help accepts one command name");
		return { kind: "help", ...(rest[0] ? { topic: rest[0] } : {}) };
	}

	if (name === "configure") {
		const parsed = parseOptions(rest, {
			...commonSpecs,
			"--api-key-stdin": { key: "apiKeyStdin", kind: "boolean" },
			"--no-verify": { key: "noVerify", kind: "boolean" },
			"--json": { key: "json", kind: "boolean" },
		});
		rejectTrailingArguments(parsed);
		return {
			kind: "configure",
			...connection(parsed.values),
			apiKeyStdin: has(parsed.values, "apiKeyStdin"),
			noVerify: has(parsed.values, "noVerify"),
			json: has(parsed.values, "json"),
			help: has(parsed.values, "help"),
		};
	}

	if (name === "doctor") {
		const parsed = parseOptions(rest, {
			...commonSpecs,
			"--json": { key: "json", kind: "boolean" },
		});
		rejectTrailingArguments(parsed);
		return {
			kind: "doctor",
			...connection(parsed.values),
			json: has(parsed.values, "json"),
			help: has(parsed.values, "help"),
		};
	}

	const incidentSpecs: Record<string, OptionSpec> = {
		...commonSpecs,
		"--title": { key: "title", kind: "value" },
		"-t": { key: "title", kind: "value" },
		"--severity": { key: "severity", kind: "value" },
		"-s": { key: "severity", kind: "value" },
		"--description": { key: "description", kind: "value" },
		"--environment": { key: "environment", kind: "value" },
		"-e": { key: "environment", kind: "value" },
		"--external-id": { key: "externalId", kind: "value" },
		"--occurred-at": { key: "occurredAt", kind: "value" },
		"--commit-sha": { key: "commitSha", kind: "value" },
		"--idempotency-key": { key: "idempotencyKey", kind: "value" },
		"--context": { key: "context", kind: "multi" },
	};

	if (name === "incident") {
		const parsed = parseOptions(rest, {
			...incidentSpecs,
			"--stdin": { key: "stdin", kind: "boolean" },
			"--stack-trace-file": { key: "stackTraceFile", kind: "value" },
			"--payload": { key: "payloadFile", kind: "value" },
			"--json": { key: "json", kind: "boolean" },
		});
		rejectTrailingArguments(parsed);
		const severityValue = severity(parsed.values);
		const title = one(parsed.values, "title");
		const description = one(parsed.values, "description");
		const environment = one(parsed.values, "environment");
		const externalId = one(parsed.values, "externalId");
		const occurredAt = one(parsed.values, "occurredAt");
		const commitSha = one(parsed.values, "commitSha");
		const stackTraceFile = one(parsed.values, "stackTraceFile");
		const payloadFile = one(parsed.values, "payloadFile");
		const idempotencyKey = one(parsed.values, "idempotencyKey");
		return {
			kind: "incident",
			...connection(parsed.values),
			...(title ? { title } : {}),
			...(severityValue ? { severity: severityValue } : {}),
			...(description ? { description } : {}),
			...(environment ? { environment } : {}),
			...(externalId ? { externalId } : {}),
			...(occurredAt ? { occurredAt } : {}),
			...(commitSha ? { commitSha } : {}),
			...(stackTraceFile ? { stackTraceFile } : {}),
			...(payloadFile ? { payloadFile } : {}),
			...(idempotencyKey ? { idempotencyKey } : {}),
			context: many(parsed.values, "context"),
			stdin: has(parsed.values, "stdin"),
			json: has(parsed.values, "json"),
			help: has(parsed.values, "help"),
		};
	}

	if (name === "run") {
		const parsed = parseOptions(rest, incidentSpecs);
		if (!has(parsed.values, "help") && !parsed.foundDelimiter)
			throw new UsageError("run requires -- before the command");
		if (!has(parsed.values, "help") && parsed.rest.length === 0)
			throw new UsageError("run requires a command after --");
		const severityValue = severity(parsed.values);
		const title = one(parsed.values, "title");
		const description = one(parsed.values, "description");
		const environment = one(parsed.values, "environment");
		const externalId = one(parsed.values, "externalId");
		const commitSha = one(parsed.values, "commitSha");
		const idempotencyKey = one(parsed.values, "idempotencyKey");
		return {
			kind: "run",
			...connection(parsed.values),
			...(title ? { title } : {}),
			...(severityValue ? { severity: severityValue } : {}),
			...(description ? { description } : {}),
			...(environment ? { environment } : {}),
			...(externalId ? { externalId } : {}),
			...(commitSha ? { commitSha } : {}),
			...(idempotencyKey ? { idempotencyKey } : {}),
			context: many(parsed.values, "context"),
			command: parsed.rest,
			help: has(parsed.values, "help"),
		};
	}

	throw new UsageError(`Unknown command: ${name}`);
}
