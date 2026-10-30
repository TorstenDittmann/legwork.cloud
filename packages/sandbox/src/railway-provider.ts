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
import { assertRelativeRepositoryPath } from "@legwork/security";
import { discoverCheckCommand, shellQuote } from "./commands";
import type { ProbeSession } from "./probe";
import {
	bounded,
	checkArgv,
	checkResult,
	errorResult,
	numberLines,
	repositoryRoot,
	type SandboxProviderOptions,
	unavailableCheck,
	validateRepositoryManifest,
} from "./shared";
import { analysisTemplate } from "./template";

export type RailwaySandboxOptions = SandboxProviderOptions;

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
				const output = numberLines(
					text.split("\n").slice(operation.start - 1, operation.end),
					operation.start,
				);
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
			return errorResult(error, "Inspection failed", Math.round(performance.now() - started));
		}
	}

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		if (!this.options.commandExecutionEnabled || !this.options.capabilityProbePassed)
			return unavailableCheck(
				"Command execution is disabled until the no-egress capability probe passes",
			);
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
				return unavailableCheck(
					`No approved ${request.check} command was discovered`,
					Math.round(performance.now() - started),
				);
			const result = await sandbox.exec(checkArgv(root, discovered).map(shellQuote).join(" "), {
				cwd: root,
				timeoutSec: 120,
			});
			return checkResult(result, Math.round(performance.now() - started));
		} catch (error) {
			return errorResult(error, "Check failed", Math.round(performance.now() - started));
		}
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		const sandbox = await Sandbox.connect(handle.id);
		await sandbox.destroy();
	}
}

export async function openRailwayProbeSession(): Promise<ProbeSession> {
	const sandbox = await Sandbox.create(analysisTemplate(), {
		idleTimeoutMinutes: 10,
		networkIsolation: "ISOLATED",
		env: {},
	});
	return {
		writeFile: async (path, content) => {
			await sandbox.files.write(path, content);
		},
		readFile: (path) => sandbox.files.read(path),
		exec: async (command, timeoutSec) => await sandbox.exec(command, { timeoutSec }),
		destroy: () => sandbox.destroy(),
	};
}
