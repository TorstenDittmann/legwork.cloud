import { performance } from "node:perf_hooks";
import { Sandbox } from "railway";
import type {
	CheckRequest,
	InspectionOperation,
	RepositoryPreparationProgress,
	RunContext,
	SandboxHandle,
	SandboxProvider,
	SandboxRepositoryManifest,
	ToolResult,
} from "@oncall-ai/contracts";
import { assertRelativeRepositoryPath } from "@oncall-ai/security";
import { discoverCheckCommand, shellQuote } from "./commands";
import { analysisTemplate } from "./template";

const MAX_OUTPUT = 64 * 1024;
const WORKSPACE = "/workspace/repositories";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface RailwaySandboxOptions {
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

function bounded(value: string): { output: string; truncated: boolean } {
	const bytes = Buffer.from(value);
	if (bytes.length <= MAX_OUTPUT) return { output: value, truncated: false };
	return { output: bytes.subarray(0, MAX_OUTPUT).toString("utf8"), truncated: true };
}

function repositoryRoot(repositoryId: string): string {
	if (!/^[0-9a-f-]{36}$/i.test(repositoryId)) throw new Error("Invalid repository identifier");
	return `${WORKSPACE}/${repositoryId}`;
}

export class RailwaySandboxProvider implements SandboxProvider {
	constructor(private readonly options: RailwaySandboxOptions) {}

	async health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy"> {
		try {
			const sandbox = await Sandbox.connect(handle.id);
			const result = await sandbox.exec("true", { timeoutSec: 5 });
			return result.exitCode === 0 && !result.timedOut ? "ready" : "unhealthy";
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			return /not found|does not exist|destroyed|404/i.test(message) ? "missing" : "unhealthy";
		}
	}

	async create(run: RunContext): Promise<SandboxHandle> {
		const sandbox = await Sandbox.create(analysisTemplate(), {
			idleTimeoutMinutes: 10,
			networkIsolation: "ISOLATED",
			env: { OCAI_RUN_ID: run.runId },
		});
		return { id: sandbox.id, createdAt: new Date(), metadata: { runId: run.runId } };
	}

	async prepareRepositories(
		handle: SandboxHandle,
		manifest: SandboxRepositoryManifest,
		incident: Uint8Array,
		onProgress?: (progress: RepositoryPreparationProgress) => void,
	): Promise<void> {
		const started = performance.now();
		validateRepositoryManifest(manifest);
		const sandbox = await Sandbox.connect(handle.id);
		await Promise.all([
			sandbox.files.write("/workspace/bootstrap-manifest.json", JSON.stringify(manifest), {
				mode: 0o600,
			}),
			sandbox.files.write("/workspace/incident.json", incident, { mode: 0o600 }),
		]);
		let output = "";
		const consume = (chunk: string) => {
			output += chunk;
			const lines = output.split("\n");
			output = lines.pop() ?? "";
			for (const line of lines) {
				try {
					const progress = JSON.parse(line) as RepositoryPreparationProgress;
					if (progress.phase === "downloading" || progress.phase === "extracting")
						onProgress?.(progress);
				} catch {
					// Bootstrap output is intentionally ignored unless it is a progress event.
				}
			}
		};
		const result = await sandbox.exec(
			"/usr/local/bin/ocai-bootstrap-repositories /workspace/bootstrap-manifest.json",
			{
				timeoutSec: 180,
				onStdout: consume,
			},
		);
		if (result.exitCode !== 0 || result.timedOut) {
			await sandbox.files.remove("/workspace/incident.json").catch(() => undefined);
			throw new Error(
				result.timedOut ? "Repository bootstrap timed out" : "Repository bootstrap failed",
			);
		}
		const ownership = await sandbox.exec("chown 10001:10001 /workspace/incident.json", {
			timeoutSec: 10,
		});
		if (ownership.exitCode !== 0) throw new Error("Failed to assign incident file ownership");
		onProgress?.({
			phase: "ready",
			repositoryCount: manifest.repositories.length,
			durationMs: Math.round(performance.now() - started),
		});
	}

	async inspect(handle: SandboxHandle, operation: InspectionOperation): Promise<ToolResult> {
		const started = performance.now();
		const sandbox = await Sandbox.connect(handle.id);
		const root = repositoryRoot(operation.repositoryId);
		try {
			if (operation.name === "read_file") {
				const safe = assertRelativeRepositoryPath(operation.path);
				const text = await sandbox.files.read(`${root}/${safe}`);
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
				const result = await sandbox.exec(
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
			const result = await sandbox.exec(
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

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		if (!this.options.commandExecutionEnabled || !this.options.capabilityProbePassed) {
			return {
				status: "unavailable",
				output: "",
				truncated: false,
				durationMs: 0,
				limitation: "Command execution is disabled until the no-egress capability probe passes",
			};
		}
		const sandbox = await Sandbox.connect(handle.id);
		const root = repositoryRoot(request.repositoryId);
		try {
			const entries = await sandbox.files.list(root);
			const names = new Set(entries.map((entry) => entry.name));
			let packageJson: unknown;
			if (names.has("package.json"))
				packageJson = JSON.parse(await sandbox.files.read(`${root}/package.json`));
			const discovered = discoverCheckCommand(names, packageJson, request.check);
			if (!discovered)
				return {
					status: "unavailable",
					output: "",
					truncated: false,
					durationMs: Math.round(performance.now() - started),
					limitation: `No approved ${request.check} command was discovered`,
				};
			const envArgs = Object.entries(discovered.environment).flatMap(([key, value]) => [
				key,
				value,
			]);
			const argv = [
				"/usr/local/bin/ocai-run-check",
				root,
				"env",
				...envArgs,
				discovered.executable,
				...discovered.args,
			];
			const result = await sandbox.exec(argv.map(shellQuote).join(" "), {
				cwd: root,
				timeoutSec: 120,
			});
			const output = bounded([result.stdout, result.stderr].filter(Boolean).join("\n"));
			if (result.timedOut)
				return {
					status: "timed_out",
					...output,
					durationMs: Math.round(performance.now() - started),
				};
			const unavailable =
				result.exitCode === 127 ||
				/not found|missing dependency|cannot find module/i.test(output.output);
			return {
				status: unavailable ? "unavailable" : result.exitCode === 0 ? "ok" : "error",
				...output,
				durationMs: Math.round(performance.now() - started),
				...(unavailable ? { limitation: "Required offline dependencies are unavailable" } : {}),
			};
		} catch (error) {
			return {
				status: "error",
				output: error instanceof Error ? error.message : "Check failed",
				truncated: false,
				durationMs: Math.round(performance.now() - started),
			};
		}
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		const sandbox = await Sandbox.connect(handle.id);
		await sandbox.destroy();
	}
}
