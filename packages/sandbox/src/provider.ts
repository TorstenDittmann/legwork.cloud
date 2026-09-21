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
import { analysisTemplate } from "./template";

export type RailwaySandboxOptions = SandboxExecutionOptions;

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
		return sandboxHandle(sandbox.id, run.runId);
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
		const pending = { value: "" };
		const result = await sandbox.exec(
			"/usr/local/bin/ocai-bootstrap-repositories /workspace/bootstrap-manifest.json",
			{
				timeoutSec: 180,
				onStdout: (chunk) => consumeBootstrapProgress(chunk, pending, onProgress),
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
		return inspectOperation(
			operation,
			{
				readFile: (path) => sandbox.files.read(path),
				exec: async (command, options) => {
					const result = await sandbox.exec(command, options);
					return {
						exitCode: result.exitCode ?? 1,
						stdout: result.stdout,
						stderr: result.stderr,
						timedOut: result.timedOut,
					};
				},
			},
			started,
		);
	}

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		const blocked = commandExecutionBlocked(this.options);
		if (blocked) return blocked;
		const sandbox = await Sandbox.connect(handle.id);
		const root = repositoryRoot(request.repositoryId);
		try {
			const entries = await sandbox.files.list(root);
			const names = new Set(entries.map((entry) => entry.name));
			let packageJson: unknown;
			if (names.has("package.json"))
				packageJson = JSON.parse(await sandbox.files.read(`${root}/package.json`));
			const discovered = buildCheckArgv(root, names, packageJson, request);
			if (discovered.unavailable)
				return {
					...discovered.unavailable,
					durationMs: Math.round(performance.now() - started),
				};
			const result = await sandbox.exec(discovered.argv.map(shellQuote).join(" "), {
				cwd: root,
				timeoutSec: 120,
			});
			return classifyCheckResult(
				result.exitCode ?? 1,
				Boolean(result.timedOut),
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
		const sandbox = await Sandbox.connect(handle.id);
		await sandbox.destroy();
	}
}
