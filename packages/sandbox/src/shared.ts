import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	CheckRequest,
	InspectionOperation,
	RepositoryPreparationProgress,
	SandboxHandle,
	SandboxRepositoryManifest,
	ToolResult,
} from "@legwork/contracts";
import { assertRelativeRepositoryPath } from "@legwork/security";
import { discoverCheckCommand, shellQuote } from "./commands";

export const MAX_OUTPUT = 64 * 1024;
export const WORKSPACE = "/workspace/repositories";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface SandboxExecutionOptions {
	commandExecutionEnabled: boolean;
	capabilityProbePassed: boolean;
}

export function validateRepositoryManifest(
	manifest: SandboxRepositoryManifest,
): SandboxRepositoryManifest {
	if (manifest.repositories.length < 1 || manifest.repositories.length > 3)
		throw new Error("Repository manifest must contain between one and three repositories");
	const identifiers = new Set<string>();
	for (const repository of manifest.repositories) {
		if (!UUID_PATTERN.test(repository.repositoryId) || identifiers.has(repository.repositoryId))
			throw new Error("Repository manifest contains an invalid identifier");
		if (!SHA_PATTERN.test(repository.sha))
			throw new Error("Repository manifest contains an invalid revision");
		let url: URL;
		try {
			url = new URL(repository.downloadUrl);
		} catch {
			throw new Error("Repository manifest contains an invalid download URL");
		}
		if (
			url.protocol !== "https:" ||
			url.hostname !== "codeload.github.com" ||
			url.username ||
			url.password ||
			url.port
		)
			throw new Error("Repository manifest contains a disallowed download URL");
		identifiers.add(repository.repositoryId);
	}
	return manifest;
}

export function bounded(value: string): { output: string; truncated: boolean } {
	const bytes = Buffer.from(value);
	if (bytes.length <= MAX_OUTPUT) return { output: value, truncated: false };
	return { output: bytes.subarray(0, MAX_OUTPUT).toString("utf8"), truncated: true };
}

export function repositoryRoot(repositoryId: string): string {
	if (!/^[0-9a-f-]{36}$/i.test(repositoryId)) throw new Error("Invalid repository identifier");
	return `${WORKSPACE}/${repositoryId}`;
}

export function loadSandboxScript(
	name: "ocai-bootstrap-repositories.py" | "ocai-run-check.sh",
): string {
	return readFileSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), "utf8");
}

export function consumeBootstrapProgress(
	chunk: string,
	pending: { value: string },
	onProgress?: (progress: RepositoryPreparationProgress) => void,
): void {
	pending.value += chunk;
	const lines = pending.value.split("\n");
	pending.value = lines.pop() ?? "";
	for (const line of lines) {
		try {
			const progress = JSON.parse(line) as RepositoryPreparationProgress;
			if (progress.phase === "downloading" || progress.phase === "extracting")
				onProgress?.(progress);
		} catch {
			// Bootstrap output is intentionally ignored unless it is a progress event.
		}
	}
}

export function commandExecutionBlocked(options: SandboxExecutionOptions): ToolResult | null {
	if (options.commandExecutionEnabled && options.capabilityProbePassed) return null;
	return {
		status: "unavailable",
		output: "",
		truncated: false,
		durationMs: 0,
		limitation: "Command execution is disabled until the no-egress capability probe passes",
	};
}

export function buildCheckArgv(
	root: string,
	names: Set<string>,
	packageJson: unknown,
	request: CheckRequest,
): { argv: string[]; unavailable?: ToolResult } {
	const discovered = discoverCheckCommand(names, packageJson, request.check);
	if (!discovered) {
		return {
			argv: [],
			unavailable: {
				status: "unavailable",
				output: "",
				truncated: false,
				durationMs: 0,
				limitation: `No approved ${request.check} command was discovered`,
			},
		};
	}
	const envArgs = Object.entries(discovered.environment).flatMap(([key, value]) => [key, value]);
	return {
		argv: [
			"/usr/local/bin/ocai-run-check",
			root,
			"env",
			...envArgs,
			discovered.executable,
			...discovered.args,
		],
	};
}

export async function inspectOperation(
	operation: InspectionOperation,
	io: {
		readFile: (path: string) => Promise<string>;
		exec: (
			command: string,
			options?: { timeoutSec?: number },
		) => Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }>;
	},
	started: number,
): Promise<ToolResult> {
	const root = repositoryRoot(operation.repositoryId);
	try {
		if (operation.name === "read_file") {
			const safe = assertRelativeRepositoryPath(operation.path);
			const text = await io.readFile(`${root}/${safe}`);
			const output = text
				.split("\n")
				.slice(operation.start - 1, operation.end)
				.map((line, index) => `${operation.start + index}: ${line}`)
				.join("\n");
			return {
				status: "ok",
				...bounded(output),
				durationMs: Math.round(performance.now() - started),
			};
		}
		if (operation.name === "list_tree") {
			const safe = assertRelativeRepositoryPath(operation.path);
			const result = await io.exec(
				`find ${shellQuote(`${root}/${safe}`)} -maxdepth ${operation.depth} -printf '%P\\n'`,
				{ timeoutSec: 15 },
			);
			const output = bounded(result.stdout || result.stderr);
			return {
				status: result.exitCode === 0 ? "ok" : "error",
				...output,
				durationMs: Math.round(performance.now() - started),
			};
		}
		const glob = operation.glob ? ` --glob ${shellQuote(operation.glob)}` : "";
		const result = await io.exec(
			`rg --line-number --color never --max-count 200${glob} -- ${shellQuote(operation.query)} ${shellQuote(root)}`,
			{ timeoutSec: 20 },
		);
		const output = bounded(result.stdout || result.stderr);
		return {
			status: result.exitCode === 0 || result.exitCode === 1 ? "ok" : "error",
			...output,
			durationMs: Math.round(performance.now() - started),
		};
	} catch (error) {
		return {
			status: "error",
			output: error instanceof Error ? error.message : "Inspection failed",
			truncated: false,
			durationMs: Math.round(performance.now() - started),
		};
	}
}

export function sandboxHandle(id: string, runId: string): SandboxHandle {
	return { id, createdAt: new Date(), metadata: { runId } };
}

export function classifyCheckResult(
	exitCode: number,
	timedOut: boolean,
	output: { output: string; truncated: boolean },
	started: number,
): ToolResult {
	if (timedOut)
		return {
			status: "timed_out",
			...output,
			durationMs: Math.round(performance.now() - started),
		};
	const unavailable =
		exitCode === 127 || /not found|missing dependency|cannot find module/i.test(output.output);
	return {
		status: unavailable ? "unavailable" : exitCode === 0 ? "ok" : "error",
		...output,
		durationMs: Math.round(performance.now() - started),
		...(unavailable ? { limitation: "Required offline dependencies are unavailable" } : {}),
	};
}
