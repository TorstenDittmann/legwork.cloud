import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import type {
	CheckRequest,
	InspectionOperation,
	RepositoryPreparationProgress,
	RunContext,
	SandboxHandle,
	SandboxProvider,
	SandboxRepositoryManifest,
	ToolResult,
} from "@legwork/contracts";
import { shellQuote } from "./commands";
import {
	bounded,
	buildCheckArgv,
	classifyCheckResult,
	commandExecutionBlocked,
	consumeBootstrapProgress,
	inspectOperation,
	repositoryRoot,
	sandboxHandle,
	type SandboxExecutionOptions,
	validateRepositoryManifest,
} from "./shared";

export interface LocalSandboxOptions extends SandboxExecutionOptions {
	/** Docker image tag. Defaults to `legwork-analysis:local`. */
	image?: string;
	/** Docker binary. Defaults to `docker`. */
	dockerBin?: string;
}

export interface ExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

const DEFAULT_IMAGE = "legwork-analysis:local";

function containerName(id: string): string {
	return `legwork-sandbox-${id}`;
}

async function runDocker(
	dockerBin: string,
	args: string[],
	options: {
		timeoutSec?: number;
		stdin?: Uint8Array | string;
		onStdout?: (chunk: string) => void;
	} = {},
): Promise<ExecResult> {
	return new Promise((resolve) => {
		const child = spawn(dockerBin, args, {
			stdio: [options.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolve({
				exitCode: timedOut ? 124 : exitCode,
				stdout,
				stderr,
				timedOut,
			});
		};
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (options.timeoutSec !== undefined) {
			timer = setTimeout(() => {
				timedOut = true;
				child.kill("SIGKILL");
			}, options.timeoutSec * 1000);
		}
		child.stdout?.on("data", (chunk: Buffer) => {
			const text = chunk.toString("utf8");
			stdout += text;
			options.onStdout?.(text);
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			stderr += error.message;
			finish(127);
		});
		child.on("close", (code) => finish(code ?? 1));
		if (options.stdin !== undefined && child.stdin) {
			child.stdin.end(options.stdin);
		}
	});
}

export function packageRoot(): string {
	return fileURLToPath(new URL("..", import.meta.url));
}

export async function buildLocalAnalysisImage(
	options: { dockerBin?: string; image?: string } = {},
): Promise<void> {
	const dockerBin = options.dockerBin ?? "docker";
	const image = options.image ?? DEFAULT_IMAGE;
	const result = await runDocker(dockerBin, [
		"build",
		"-t",
		image,
		"-f",
		join(packageRoot(), "Dockerfile"),
		packageRoot(),
	]);
	if (result.exitCode !== 0)
		throw new Error(result.stderr.trim() || "Failed to build local analysis sandbox image");
}

export class LocalSandboxProvider implements SandboxProvider {
	private readonly image: string;
	private readonly dockerBin: string;

	constructor(private readonly options: LocalSandboxOptions) {
		this.image = options.image ?? DEFAULT_IMAGE;
		this.dockerBin = options.dockerBin ?? "docker";
	}

	private async docker(
		args: string[],
		options: {
			timeoutSec?: number;
			stdin?: Uint8Array | string;
			onStdout?: (chunk: string) => void;
		} = {},
	): Promise<ExecResult> {
		return runDocker(this.dockerBin, args, options);
	}

	private async execIn(
		handle: SandboxHandle,
		command: string,
		options: { timeoutSec?: number; onStdout?: (chunk: string) => void; cwd?: string } = {},
	): Promise<ExecResult> {
		const args = ["exec"];
		if (options.cwd) args.push("-w", options.cwd);
		args.push(containerName(handle.id), "sh", "-c", command);
		const dockerOptions: {
			timeoutSec?: number;
			onStdout?: (chunk: string) => void;
		} = {};
		if (options.timeoutSec !== undefined) dockerOptions.timeoutSec = options.timeoutSec;
		if (options.onStdout !== undefined) dockerOptions.onStdout = options.onStdout;
		return this.docker(args, dockerOptions);
	}

	async health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy"> {
		const inspect = await this.docker(
			["inspect", "-f", "{{.State.Running}}", containerName(handle.id)],
			{
				timeoutSec: 10,
			},
		);
		if (inspect.exitCode !== 0) return "missing";
		if (inspect.stdout.trim() !== "true") return "unhealthy";
		const result = await this.execIn(handle, "true", { timeoutSec: 5 });
		return result.exitCode === 0 && !result.timedOut ? "ready" : "unhealthy";
	}

	async create(run: RunContext): Promise<SandboxHandle> {
		const id = crypto.randomUUID();
		const result = await this.docker(
			[
				"run",
				"-d",
				"--name",
				containerName(id),
				"--label",
				"legwork.sandbox=1",
				"--label",
				`legwork.run_id=${run.runId}`,
				"-e",
				`OCAI_RUN_ID=${run.runId}`,
				this.image,
			],
			{ timeoutSec: 60 },
		);
		if (result.exitCode !== 0) {
			throw new Error(result.stderr.trim() || "Failed to create local sandbox container");
		}
		return sandboxHandle(id, run.runId);
	}

	async prepareRepositories(
		handle: SandboxHandle,
		manifest: SandboxRepositoryManifest,
		incident: Uint8Array,
		onProgress?: (progress: RepositoryPreparationProgress) => void,
	): Promise<void> {
		const started = performance.now();
		validateRepositoryManifest(manifest);
		const staging = await mkdtemp(join(tmpdir(), "legwork-sandbox-"));
		try {
			const manifestPath = join(staging, "bootstrap-manifest.json");
			const incidentPath = join(staging, "incident.json");
			await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
			await writeFile(incidentPath, incident, { mode: 0o600 });
			for (const [local, remote] of [
				[manifestPath, "/workspace/bootstrap-manifest.json"],
				[incidentPath, "/workspace/incident.json"],
			] as const) {
				const copied = await this.docker(["cp", local, `${containerName(handle.id)}:${remote}`], {
					timeoutSec: 30,
				});
				if (copied.exitCode !== 0)
					throw new Error(copied.stderr.trim() || `Failed to copy ${remote} into sandbox`);
			}
			const pending = { value: "" };
			const result = await this.execIn(
				handle,
				"/usr/local/bin/ocai-bootstrap-repositories /workspace/bootstrap-manifest.json",
				{
					timeoutSec: 180,
					onStdout: (chunk) => consumeBootstrapProgress(chunk, pending, onProgress),
				},
			);
			if (result.exitCode !== 0 || result.timedOut) {
				await this.execIn(handle, "rm -f /workspace/incident.json", { timeoutSec: 10 }).catch(
					() => undefined,
				);
				throw new Error(
					result.timedOut
						? "Repository bootstrap timed out"
						: result.stderr.trim() || "Repository bootstrap failed",
				);
			}
			const ownership = await this.execIn(handle, "chown 10001:10001 /workspace/incident.json", {
				timeoutSec: 10,
			});
			if (ownership.exitCode !== 0) throw new Error("Failed to assign incident file ownership");
			onProgress?.({
				phase: "ready",
				repositoryCount: manifest.repositories.length,
				durationMs: Math.round(performance.now() - started),
			});
		} finally {
			await rm(staging, { recursive: true, force: true });
		}
	}

	async inspect(handle: SandboxHandle, operation: InspectionOperation): Promise<ToolResult> {
		const started = performance.now();
		return inspectOperation(
			operation,
			{
				readFile: async (path) => {
					const staging = await mkdtemp(join(tmpdir(), "legwork-read-"));
					try {
						const destination = join(staging, "file");
						const copied = await this.docker(
							["cp", `${containerName(handle.id)}:${path}`, destination],
							{ timeoutSec: 30 },
						);
						if (copied.exitCode !== 0)
							throw new Error(copied.stderr.trim() || "Failed to read sandbox file");
						return await readFile(destination, "utf8");
					} finally {
						await rm(staging, { recursive: true, force: true });
					}
				},
				exec: (command, options) => this.execIn(handle, command, options),
			},
			started,
		);
	}

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		const blocked = commandExecutionBlocked(this.options);
		if (blocked) return blocked;
		const root = repositoryRoot(request.repositoryId);
		try {
			const listing = await this.execIn(
				handle,
				`find ${shellQuote(root)} -maxdepth 1 -mindepth 1 -printf '%f\\n'`,
				{ timeoutSec: 15 },
			);
			if (listing.exitCode !== 0)
				return {
					status: "error",
					output: listing.stderr.trim() || "Failed to list repository root",
					truncated: false,
					durationMs: Math.round(performance.now() - started),
				};
			const names = new Set(
				listing.stdout
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean),
			);
			let packageJson: unknown;
			if (names.has("package.json")) {
				const raw = await this.execIn(handle, `cat ${shellQuote(`${root}/package.json`)}`, {
					timeoutSec: 10,
				});
				if (raw.exitCode !== 0)
					return {
						status: "error",
						output: raw.stderr.trim() || "Failed to read package.json",
						truncated: false,
						durationMs: Math.round(performance.now() - started),
					};
				packageJson = JSON.parse(raw.stdout);
			}
			const discovered = buildCheckArgv(root, names, packageJson, request);
			if (discovered.unavailable)
				return {
					...discovered.unavailable,
					durationMs: Math.round(performance.now() - started),
				};
			const result = await this.execIn(handle, discovered.argv.map(shellQuote).join(" "), {
				cwd: root,
				timeoutSec: 120,
			});
			return classifyCheckResult(
				result.exitCode,
				result.timedOut,
				bounded([result.stdout, result.stderr].filter(Boolean).join("\n")),
				started,
			);
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
		await this.docker(["rm", "-f", containerName(handle.id)], { timeoutSec: 60 });
	}
}
