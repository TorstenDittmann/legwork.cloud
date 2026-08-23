#!/usr/bin/env bun

import { basename } from "node:path";
import {
	MAX_DIAGNOSTIC_TEXT_BYTES,
	MAX_REQUEST_BYTES,
	type CreateIncidentRequest,
	type CreateIncidentResponse,
} from "@legwork/contracts";
import { parseCliArgs, type CliCommand } from "./args";
import { LegworkClient } from "./client";
import {
	DEFAULT_API_URL,
	normalizeApiUrl,
	readStoredConfig,
	resolveConfig,
	validateApiKey,
	validateServiceSlug,
	writeConfig,
	type ConnectionOverrides,
	type LegworkConfig,
} from "./config";
import { CliError, UsageError } from "./errors";
import { promptSecret, promptText, readStdin, readTextFile } from "./input";
import {
	createIdempotencyKey,
	inferCommitSha,
	inferEnvironment,
	inferExternalId,
	inferredContext,
	parseContext,
	parseIncidentPayload,
	validateIdempotencyKey,
} from "./payload";
import { TailBuffer } from "./tail-buffer";

const VERSION = "0.1.0";

const mainHelp = `Legwork CLI ${VERSION}

Turn command failures and operational signals into queued investigations.

Usage:
  legwork configure [options]
  legwork run [incident options] -- <command> [args...]
  legwork incident --title <title> [options]
  legwork doctor [options]

Quick start:
  legwork configure --service payments-api
  legwork run --environment production -- bun test

Commands:
  configure   Save and verify a service connection
  run         Run a command; report it only when it fails
  incident    Report an incident from flags, stdin, or a JSON payload
  doctor      Verify the configured service and ingestion key

Run legwork help <command> for command-specific options.`;

const commandHelp: Record<string, string> = {
	configure: `Usage: legwork configure [options]

Configure one service and verify it before saving.

Options:
  --service <slug>    Service slug from the Legwork dashboard
  --url <origin>      API origin (default: ${DEFAULT_API_URL})
  --api-key <key>     Ingestion key (prefer the prompt or stdin)
  --api-key-stdin     Read the ingestion key from stdin
  --no-verify         Save without checking the connection
  --json              Print machine-readable output
  -h, --help          Show this help`,
	doctor: `Usage: legwork doctor [connection options]

Verify that Legwork can authenticate the configured service.

Options:
  --service <slug>    Override the configured service
  --url <origin>      Override the configured API origin
  --api-key <key>     Override the configured ingestion key
  --json              Print machine-readable output
  -h, --help          Show this help`,
	incident: `Usage: legwork incident --title <title> [options]

Create an incident immediately. Use --stdin to attach piped diagnostics.

Options:
  -t, --title <text>          Incident title (required without --payload)
  -s, --severity <level>      critical, high, medium, low, or unknown (default: high)
  --description <text>       What happened or what users experienced
  -e, --environment <name>   Environment name
  --external-id <id>         Stable source identifier for this incident
  --occurred-at <ISO date>   Event time (default: now)
  --commit-sha <sha>         Full 40-character Git commit SHA
  --context <key=value>      Add context; repeat for multiple values
  --stdin                    Read diagnostic output from stdin
  --stack-trace-file <path>  Read diagnostic output from a file
  --payload <path>           Send a complete JSON incident payload
  --idempotency-key <key>    Override the generated idempotency key
  --json                     Print machine-readable output
  -h, --help                 Show this help

Connection overrides: --service, --url, --api-key`,
	run: `Usage: legwork run [incident options] -- <command> [args...]

Stream a command normally. If it fails, report the captured output to Legwork
and preserve the command's exit code.

Options:
  -t, --title <text>          Override the incident title
  -s, --severity <level>      critical, high, medium, low, or unknown (default: high)
  --description <text>       Add incident context
  -e, --environment <name>   Environment name
  --external-id <id>         Stable source identifier for this incident
  --commit-sha <sha>         Full 40-character Git commit SHA
  --context <key=value>      Add context; repeat for multiple values
  --idempotency-key <key>    Override the generated idempotency key
  -h, --help                 Show this help

Connection overrides: --service, --url, --api-key`,
};

export async function runCli(args: string[]): Promise<number> {
	try {
		const command = parseCliArgs(args);
		if (command.kind === "help") {
			printHelp(command.topic);
			return 0;
		}
		if (command.kind === "version") {
			process.stdout.write(`${VERSION}\n`);
			return 0;
		}
		if (command.help) {
			process.stdout.write(`${commandHelp[command.kind]}\n`);
			return 0;
		}

		switch (command.kind) {
			case "configure":
				return await configure(command);
			case "doctor":
				return await doctor(command);
			case "incident":
				return await incident(command);
			case "run":
				return await runCommand(command);
		}
	} catch (error) {
		const cliError = normalizeError(error);
		process.stderr.write(`Error: ${cliError.message}\n`);
		if (cliError instanceof UsageError) process.stderr.write("Run legwork --help for usage.\n");
		return cliError.exitCode;
	}
}

async function configure(command: Extract<CliCommand, { kind: "configure" }>): Promise<number> {
	if (command.apiKey && command.apiKeyStdin)
		throw new UsageError("Use only one of --api-key and --api-key-stdin");
	const stored = await readStoredConfig().catch(() => undefined);
	const apiUrl = normalizeApiUrl(
		command.apiUrl ??
			process.env.LEGWORK_API_URL ??
			process.env.LEGWORK_URL ??
			stored?.apiUrl ??
			DEFAULT_API_URL,
	);
	const service = validateServiceSlug(
		command.service ??
			process.env.LEGWORK_SERVICE ??
			stored?.service ??
			(await promptText("Service slug: ")),
	);
	const apiKeyInput = command.apiKeyStdin
		? await readStdin(256)
		: (command.apiKey ??
			process.env.LEGWORK_API_KEY ??
			stored?.apiKey ??
			(await promptSecret("Ingestion key: ")));
	const config: LegworkConfig = { apiUrl, service, apiKey: validateApiKey(apiKeyInput) };
	let serviceName: string | undefined;
	if (!command.noVerify) {
		const checked = await new LegworkClient(config).checkService();
		serviceName = checked.service.name;
	}
	const path = await writeConfig(config);
	if (command.json) {
		printJson({
			status: "configured",
			apiUrl,
			service,
			...(serviceName ? { serviceName } : {}),
			verified: !command.noVerify,
			configPath: path,
		});
	} else {
		const target = serviceName ? `${serviceName} (${service})` : service;
		process.stdout.write(`${successMark()} Configured ${target}\n`);
		process.stdout.write(`  Saved securely to ${path}\n`);
		if (command.noVerify)
			process.stdout.write("  Connection not verified; run legwork doctor when ready.\n");
	}
	return 0;
}

async function doctor(command: Extract<CliCommand, { kind: "doctor" }>): Promise<number> {
	const config = await resolveConfig(connectionOverrides(command));
	const checked = await new LegworkClient(config).checkService();
	if (command.json) {
		printJson({ ...checked, apiUrl: config.apiUrl });
	} else {
		process.stdout.write(
			`${successMark()} Connected to ${checked.service.name} (${checked.service.slug})\n`,
		);
		process.stdout.write(`  ${config.apiUrl}\n`);
	}
	return 0;
}

async function incident(command: Extract<CliCommand, { kind: "incident" }>): Promise<number> {
	validateIncidentUsage(command);
	const config = await resolveConfig(connectionOverrides(command));
	const request = command.payloadFile
		? await requestFromPayloadFile(command)
		: await requestFromFlags(command);
	const idempotencyKey = command.idempotencyKey
		? validateIdempotencyKey(command.idempotencyKey)
		: createIdempotencyKey(config.service, request.externalId);
	const result = await new LegworkClient(config).createIncident(request, idempotencyKey);
	printIncidentResult(result, command.json);
	return 0;
}

function validateIncidentUsage(command: Extract<CliCommand, { kind: "incident" }>): void {
	if (!command.payloadFile && !command.title)
		throw new UsageError("incident requires --title or --payload");
	if (command.stdin && command.stackTraceFile)
		throw new UsageError("Use only one of --stdin and --stack-trace-file");
	if (
		command.payloadFile &&
		(command.title ||
			command.severity ||
			command.description ||
			command.environment ||
			command.externalId ||
			command.occurredAt ||
			command.commitSha ||
			command.context.length > 0 ||
			command.stdin ||
			command.stackTraceFile)
	)
		throw new UsageError("--payload cannot be combined with incident field options");
}

async function requestFromPayloadFile(
	command: Extract<CliCommand, { kind: "incident" }>,
): Promise<CreateIncidentRequest> {
	const source = await readTextFile(command.payloadFile!, MAX_REQUEST_BYTES);
	try {
		return parseIncidentPayload(JSON.parse(source) as unknown);
	} catch (error) {
		if (error instanceof CliError) throw error;
		throw new UsageError(`Invalid JSON in ${command.payloadFile}`);
	}
}

async function requestFromFlags(
	command: Extract<CliCommand, { kind: "incident" }>,
): Promise<CreateIncidentRequest> {
	if (!command.title) throw new UsageError("incident requires --title or --payload");
	const stackTrace = command.stdin
		? await readStdin(MAX_DIAGNOSTIC_TEXT_BYTES)
		: command.stackTraceFile
			? await readTextFile(command.stackTraceFile, MAX_DIAGNOSTIC_TEXT_BYTES)
			: undefined;
	return buildRequest({
		title: command.title,
		severity: command.severity ?? "high",
		...(command.description ? { description: command.description } : {}),
		...(command.environment ? { environment: command.environment } : {}),
		...(command.externalId ? { externalId: command.externalId } : {}),
		...(command.occurredAt ? { occurredAt: command.occurredAt } : {}),
		...(command.commitSha ? { commitSha: command.commitSha } : {}),
		...(stackTrace ? { stackTrace } : {}),
		context: { ...parseContext(command.context), trigger: "cli.incident" },
	});
}

async function runCommand(command: Extract<CliCommand, { kind: "run" }>): Promise<number> {
	const executable = basename(command.command[0]!);
	const capture = new TailBuffer(MAX_DIAGNOSTIC_TEXT_BYTES);
	let exitCode = 127;
	let child: Bun.Subprocess<"inherit", "pipe", "pipe"> | undefined;

	try {
		child = Bun.spawn(command.command, {
			stdin: "inherit",
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
		});
	} catch (error) {
		const message = `Could not start ${executable}: ${errorMessage(error)}`;
		process.stderr.write(`${message}\n`);
		capture.append(`[spawn]\n${message}\n`);
		exitCode = 127;
	}

	if (child) {
		const forwardInterrupt = () => child?.kill("SIGINT");
		const forwardTermination = () => child?.kill("SIGTERM");
		process.once("SIGINT", forwardInterrupt);
		process.once("SIGTERM", forwardTermination);
		try {
			await Promise.all([
				pipeAndCapture(child.stdout, process.stdout, capture, "stdout"),
				pipeAndCapture(child.stderr, process.stderr, capture, "stderr"),
			]);
			exitCode = await child.exited;
		} finally {
			const removeProcessListener = process.off as unknown as (
				event: string,
				listener: () => void,
			) => typeof process;
			removeProcessListener.call(process, "SIGINT", forwardInterrupt);
			removeProcessListener.call(process, "SIGTERM", forwardTermination);
		}
	}

	if (exitCode === 0) return 0;

	try {
		const config = await resolveConfig(connectionOverrides(command));
		const externalId = command.externalId ?? inferExternalId();
		const request = buildRequest({
			title: command.title ?? `Command failed: ${executable}`,
			severity: command.severity ?? "high",
			description: command.description ?? `The command exited with status ${exitCode}.`,
			...(command.environment ? { environment: command.environment } : {}),
			externalId,
			...(command.commitSha ? { commitSha: command.commitSha } : {}),
			...(capture.toString() ? { stackTrace: capture.toString() } : {}),
			context: {
				...parseContext(command.context),
				trigger: "cli.run",
				command: executable,
				exit_code: String(exitCode),
			},
		});
		const idempotencyKey = command.idempotencyKey
			? validateIdempotencyKey(command.idempotencyKey)
			: createIdempotencyKey(config.service, request.externalId);
		const result = await new LegworkClient(config).createIncident(request, idempotencyKey);
		process.stderr.write(`${successMark(true)} Failure reported: ${result.dashboardUrl}\n`);
	} catch (error) {
		process.stderr.write(
			`Legwork could not report this failure: ${normalizeError(error).message}\n`,
		);
	}
	return exitCode;
}

function buildRequest(input: {
	title: string;
	severity: CreateIncidentRequest["severity"];
	description?: string;
	environment?: string;
	externalId?: string;
	occurredAt?: string;
	commitSha?: string;
	stackTrace?: string;
	context: Record<string, string>;
}): CreateIncidentRequest {
	const context = { ...inferredContext(), ...input.context };
	return parseIncidentPayload({
		externalId: input.externalId ?? inferExternalId(),
		title: input.title,
		severity: input.severity,
		occurredAt: input.occurredAt ?? new Date().toISOString(),
		...(input.description ? { description: input.description } : {}),
		environment: input.environment ?? inferEnvironment(),
		primaryCommitSha: input.commitSha ?? inferCommitSha(),
		...(input.stackTrace ? { stackTrace: input.stackTrace } : {}),
		...(Object.keys(context).length > 0 ? { context } : {}),
	});
}

async function pipeAndCapture(
	stream: ReadableStream<Uint8Array>,
	destination: NodeJS.WriteStream,
	capture: TailBuffer,
	label: string,
): Promise<void> {
	const reader = stream.getReader();
	let started = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return;
		if (!started) {
			capture.append(`[${label}]\n`);
			started = true;
		}
		capture.append(value);
		if (!destination.write(value))
			await new Promise<void>((resolve) => destination.once("drain", resolve));
	}
}

function connectionOverrides(command: ConnectionOverrides): ConnectionOverrides {
	return {
		...(command.apiUrl ? { apiUrl: command.apiUrl } : {}),
		...(command.service ? { service: command.service } : {}),
		...(command.apiKey ? { apiKey: command.apiKey } : {}),
	};
}

function printIncidentResult(result: CreateIncidentResponse, json: boolean): void {
	if (json) {
		printJson(result);
		return;
	}
	process.stdout.write(`${successMark()} Incident queued for investigation\n`);
	process.stdout.write(`  ${result.dashboardUrl}\n`);
}

function printHelp(topic?: string): void {
	if (!topic) {
		process.stdout.write(`${mainHelp}\n`);
		return;
	}
	const help = commandHelp[topic];
	if (!help) throw new UsageError(`Unknown help topic: ${topic}`);
	process.stdout.write(`${help}\n`);
}

function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

function successMark(stderr = false): string {
	const tty = stderr ? process.stderr.isTTY : process.stdout.isTTY;
	return tty && !process.env.NO_COLOR ? "\u001b[32m✓\u001b[0m" : "OK";
}

function normalizeError(error: unknown): CliError {
	if (error instanceof CliError) return error;
	return new CliError(errorMessage(error));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) process.exitCode = await runCli(process.argv.slice(2));
