import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
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
import { discoverCheckCommand } from "./commands";
import { docker, type DockerResult, isMissingContainer } from "./docker";
import type { ProbeSession } from "./probe";
import {
	ANALYST_UID,
	bounded,
	checkArgv,
	checkResult,
	errorResult,
	numberLines,
	repositoryRoot,
	type SandboxProviderOptions,
	stagedArchivePath,
	unavailableCheck,
	validateRepositoryManifest,
} from "./shared";
import { SANDBOX_IMAGE_DIRECTORY } from "./template";

export const DEFAULT_SANDBOX_IMAGE = "legwork-sandbox:local";
/** gVisor: the only runtime under which repository commands may run. */
export const ISOLATED_RUNTIME = "runsc";

const MAX_COMPRESSED = 250 * 1024 * 1024;
const MAX_READ = 4 * 1024 * 1024;
const CONTAINER_ID = /^[0-9a-f]{64}$/;
const RUN_LABEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[0-9]{1,6})?$/i;
const INCIDENT_PATH = "/workspace/incident.json";
const MANIFEST_PATH = "/workspace/bootstrap-manifest.json";
// `unshare` needs SYS_ADMIN and `setpriv` needs SETUID/SETGID inside the sandbox kernel;
// bootstrap needs CHOWN/FOWNER/DAC_OVERRIDE, and `timeout` needs KILL to stop the analyst.
const CAPABILITIES = ["CHOWN", "DAC_OVERRIDE", "FOWNER", "KILL", "SETGID", "SETUID", "SYS_ADMIN"];

export interface DockerSandboxConfig {
	image: string;
	runtime: string;
}

export interface DockerSandboxOptions extends SandboxProviderOptions, DockerSandboxConfig {}

export function dockerSandboxConfig(env: NodeJS.ProcessEnv = process.env): DockerSandboxConfig {
	return {
		image: env.SANDBOX_IMAGE || DEFAULT_SANDBOX_IMAGE,
		runtime: env.SANDBOX_DOCKER_RUNTIME || ISOLATED_RUNTIME,
	};
}

/** Confirms the runtime is registered with Docker and the image exists, building it if needed. */
export async function prepareDockerSandboxRuntime(config: DockerSandboxConfig): Promise<void> {
	const info = await docker(["info", "--format", "{{json .Runtimes}}"], { timeoutMs: 30_000 });
	if (info.exitCode !== 0) throw new Error("Docker is unavailable to the worker");
	const runtimes = JSON.parse(info.stdout) as Record<string, unknown>;
	if (!(config.runtime in runtimes))
		throw new Error(`Docker runtime ${config.runtime} is not registered`);
	const image = await docker(["image", "inspect", "--format", "{{.Id}}", config.image], {
		timeoutMs: 30_000,
	});
	if (image.exitCode === 0) return;
	const build = await docker(
		["build", "--tag", config.image, fileURLToPath(SANDBOX_IMAGE_DIRECTORY)],
		{ timeoutMs: 30 * 60_000 },
	);
	if (build.exitCode !== 0) throw new Error(`Sandbox image build failed: ${build.stderr.trim()}`);
}

function containerId(handle: SandboxHandle): string {
	if (!CONTAINER_ID.test(handle.id)) throw new Error("Invalid sandbox identifier");
	return handle.id;
}

interface ExecOptions {
	user: "root" | "analyst";
	timeoutSec: number;
	cwd?: string;
	input?: Uint8Array | AsyncIterable<Uint8Array>;
	onStdout?: (chunk: string) => void;
	maxOutput?: number;
}

async function exec(id: string, command: string[], options: ExecOptions): Promise<DockerResult> {
	const user = options.user === "root" ? "0:0" : `${ANALYST_UID}:${ANALYST_UID}`;
	const started = performance.now();
	// Killing the CLI does not stop the process in the sandbox, so the deadline is enforced inside it.
	const result = await docker(
		[
			"exec",
			"--interactive",
			"--user",
			user,
			...(options.cwd ? ["--workdir", options.cwd] : []),
			id,
			"timeout",
			"--kill-after=5",
			String(options.timeoutSec),
			...command,
		],
		{
			input: options.input,
			onStdout: options.onStdout,
			maxOutput: options.maxOutput,
			timeoutMs: (options.timeoutSec + 15) * 1_000,
		},
	);
	const elapsed = performance.now() - started;
	const timedOut =
		result.timedOut ||
		result.exitCode === 124 ||
		(result.exitCode === 137 && elapsed >= options.timeoutSec * 1_000);
	return { ...result, timedOut };
}

async function writeFile(
	id: string,
	path: string,
	content: Uint8Array | AsyncIterable<Uint8Array>,
	timeoutSec = 30,
): Promise<void> {
	// noclobber refuses to follow or replace anything already at the path.
	const result = await exec(id, ["sh", "-c", 'set -C; umask 077; exec cat > "$1"', "sh", path], {
		user: "root",
		timeoutSec,
		input: content,
	});
	if (result.exitCode !== 0 || result.timedOut) throw new Error("Failed to write sandbox file");
}

async function* metered(
	body: ReadableStream<Uint8Array>,
	budget: { compressed: number },
): AsyncIterable<Uint8Array> {
	const reader = body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			budget.compressed += value.byteLength;
			if (budget.compressed > MAX_COMPRESSED)
				throw new Error("Archive compressed size limit exceeded");
			yield value;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}

/**
 * Runs each analysis in a Docker container under gVisor with no network interface.
 * Because the sandbox has no egress at all, the worker streams each exact-SHA archive
 * into it, and the in-sandbox bootstrap validates and extracts it as on every provider.
 */
export class DockerSandboxProvider implements SandboxProvider {
	constructor(private readonly options: DockerSandboxOptions) {}

	async health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy"> {
		const result = await docker(
			["container", "inspect", "--format", "{{.State.Running}}", containerId(handle)],
			{ timeoutMs: 15_000 },
		);
		if (result.exitCode !== 0) return isMissingContainer(result) ? "missing" : "unhealthy";
		return result.stdout.trim() === "true" ? "ready" : "missing";
	}

	async create(run: RunContext): Promise<SandboxHandle> {
		// The graph labels each sandbox generation as `<run uuid>-<generation>`.
		if (!RUN_LABEL.test(run.runId)) throw new Error("Invalid run identifier");
		const result = await docker(
			[
				"run",
				"--detach",
				"--rm",
				"--runtime",
				this.options.runtime,
				"--network",
				"none",
				"--hostname",
				"sandbox",
				"--cap-drop",
				"ALL",
				...CAPABILITIES.flatMap((capability) => ["--cap-add", capability]),
				"--security-opt",
				"no-new-privileges",
				"--pids-limit",
				"512",
				"--memory",
				"4g",
				"--cpus",
				"2",
				"--label",
				"legwork.sandbox=true",
				"--label",
				`legwork.run-id=${run.runId}`,
				"--env",
				`OCAI_RUN_ID=${run.runId}`,
				this.options.image,
			],
			{ timeoutMs: 120_000 },
		);
		const id = result.stdout.trim();
		if (result.exitCode !== 0 || !CONTAINER_ID.test(id))
			throw new Error(`Sandbox creation failed: ${result.stderr.trim()}`);
		return { id, createdAt: new Date(), metadata: { runId: run.runId } };
	}

	async prepareRepositories(
		handle: SandboxHandle,
		manifest: SandboxRepositoryManifest,
		incident: Uint8Array,
		onProgress?: (progress: RepositoryPreparationProgress) => void,
	): Promise<void> {
		const started = performance.now();
		validateRepositoryManifest(manifest);
		const id = containerId(handle);
		const archives = manifest.repositories.map((repository) =>
			stagedArchivePath(repository.repositoryId),
		);
		try {
			await writeFile(id, INCIDENT_PATH, incident);
			const budget = { compressed: 0 };
			const total = manifest.repositories.length;
			for (const [offset, repository] of manifest.repositories.entries()) {
				onProgress?.({
					phase: "downloading",
					repositoryId: repository.repositoryId,
					index: offset + 1,
					total,
				});
				const response = await fetch(repository.downloadUrl, {
					redirect: "error",
					headers: { "User-Agent": "legwork-sandbox" },
					signal: AbortSignal.timeout(120_000),
				});
				if (response.status !== 200 || !response.body)
					throw new Error("Repository download failed");
				await writeFile(
					id,
					stagedArchivePath(repository.repositoryId),
					metered(response.body, budget),
					150,
				);
			}
			await writeFile(
				id,
				MANIFEST_PATH,
				Buffer.from(
					JSON.stringify({
						repositories: manifest.repositories.map((repository) => ({
							repositoryId: repository.repositoryId,
							sha: repository.sha,
							archivePath: stagedArchivePath(repository.repositoryId),
						})),
					}),
				),
			);
			let pending = "";
			const result = await exec(id, ["/usr/local/bin/ocai-bootstrap-repositories", MANIFEST_PATH], {
				user: "root",
				timeoutSec: 180,
				onStdout: (chunk) => {
					pending += chunk;
					const lines = pending.split("\n");
					pending = lines.pop() ?? "";
					for (const line of lines) {
						try {
							const progress = JSON.parse(line) as RepositoryPreparationProgress;
							if (progress.phase === "extracting") onProgress?.(progress);
						} catch {
							// Bootstrap output is intentionally ignored unless it is a progress event.
						}
					}
				},
			});
			if (result.exitCode !== 0 || result.timedOut)
				throw new Error(
					result.timedOut ? "Repository bootstrap timed out" : "Repository bootstrap failed",
				);
			const ownership = await exec(id, ["chown", `${ANALYST_UID}:${ANALYST_UID}`, INCIDENT_PATH], {
				user: "root",
				timeoutSec: 10,
			});
			if (ownership.exitCode !== 0) throw new Error("Failed to assign incident file ownership");
		} catch (error) {
			await exec(id, ["rm", "-f", INCIDENT_PATH, MANIFEST_PATH, ...archives], {
				user: "root",
				timeoutSec: 10,
			}).catch(() => undefined);
			throw error;
		}
		onProgress?.({
			phase: "ready",
			repositoryCount: manifest.repositories.length,
			durationMs: Math.round(performance.now() - started),
		});
	}

	async inspect(handle: SandboxHandle, operation: InspectionOperation): Promise<ToolResult> {
		const started = performance.now();
		const elapsed = () => Math.round(performance.now() - started);
		try {
			const id = containerId(handle);
			const root = repositoryRoot(operation.repositoryId);
			if (operation.name === "read_file") {
				const safe = assertRelativeRepositoryPath(operation.path);
				if (!Number.isInteger(operation.start) || !Number.isInteger(operation.end))
					throw new Error("Invalid line range");
				const result = await exec(
					id,
					["sed", "-n", `${operation.start},${operation.end}p`, "--", `${root}/${safe}`],
					{ user: "analyst", timeoutSec: 15, maxOutput: MAX_READ },
				);
				if (result.exitCode !== 0)
					return { status: "error", ...bounded(result.stderr), durationMs: elapsed() };
				const lines = result.stdout.endsWith("\n")
					? result.stdout.slice(0, -1).split("\n")
					: result.stdout.split("\n");
				return {
					status: "ok",
					...bounded(numberLines(lines, operation.start)),
					durationMs: elapsed(),
				};
			}
			if (operation.name === "list_tree") {
				const safe = assertRelativeRepositoryPath(operation.path);
				const result = await exec(
					id,
					["find", `${root}/${safe}`, "-maxdepth", String(operation.depth), "-printf", "%P\\n"],
					{ user: "analyst", timeoutSec: 15 },
				);
				return {
					status: result.exitCode === 0 ? "ok" : "error",
					...bounded(result.stdout || result.stderr),
					durationMs: elapsed(),
				};
			}
			const glob = operation.glob ? ["--glob", operation.glob] : [];
			const result = await exec(
				id,
				[
					"rg",
					"--line-number",
					"--color",
					"never",
					"--max-count",
					"200",
					...glob,
					"--",
					operation.query,
					root,
				],
				{ user: "analyst", timeoutSec: 20 },
			);
			return {
				status: result.exitCode === 0 || result.exitCode === 1 ? "ok" : "error",
				...bounded(result.stdout || result.stderr),
				durationMs: elapsed(),
			};
		} catch (error) {
			return errorResult(error, "Inspection failed", elapsed());
		}
	}

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		const elapsed = () => Math.round(performance.now() - started);
		if (!this.options.commandExecutionEnabled || !this.options.capabilityProbePassed)
			return unavailableCheck(
				"Command execution is disabled until the no-egress capability probe passes",
			);
		if (this.options.runtime !== ISOLATED_RUNTIME)
			return unavailableCheck("Command execution requires the gVisor sandbox runtime");
		try {
			const id = containerId(handle);
			const root = repositoryRoot(request.repositoryId);
			const listing = await exec(id, ["ls", "-A", "--", root], {
				user: "analyst",
				timeoutSec: 10,
			});
			if (listing.exitCode !== 0) throw new Error("Repository is not available");
			const names = new Set(listing.stdout.split("\n").filter(Boolean));
			let packageJson: unknown;
			if (names.has("package.json")) {
				const file = await exec(id, ["cat", "--", `${root}/package.json`], {
					user: "analyst",
					timeoutSec: 10,
					maxOutput: MAX_READ,
				});
				if (file.exitCode !== 0) throw new Error("package.json could not be read");
				packageJson = JSON.parse(file.stdout);
			}
			const discovered = discoverCheckCommand(names, packageJson, request.check);
			if (!discovered)
				return unavailableCheck(`No approved ${request.check} command was discovered`, elapsed());
			const result = await exec(id, checkArgv(root, discovered), {
				user: "root",
				cwd: root,
				timeoutSec: 120,
			});
			return checkResult(result, elapsed());
		} catch (error) {
			return errorResult(error, "Check failed", elapsed());
		}
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		const result = await docker(["container", "rm", "--force", containerId(handle)], {
			timeoutMs: 60_000,
		});
		if (result.exitCode !== 0 && !isMissingContainer(result))
			throw new Error(`Sandbox destruction failed: ${result.stderr.trim()}`);
	}
}

export async function openDockerProbeSession(config: DockerSandboxConfig): Promise<ProbeSession> {
	const provider = new DockerSandboxProvider({
		...config,
		commandExecutionEnabled: false,
		capabilityProbePassed: false,
	});
	const handle = await provider.create({
		runId: crypto.randomUUID(),
		organizationId: "capability-probe",
		repositories: [],
	});
	const id = handle.id;
	return {
		async writeFile(path, content) {
			const result = await exec(id, ["sh", "-c", 'set -C; exec cat > "$1"', "sh", path], {
				user: "root",
				timeoutSec: 10,
				input: Buffer.from(content),
			});
			if (result.exitCode !== 0) throw new Error("Failed to write probe file");
		},
		async readFile(path) {
			const result = await exec(id, ["cat", "--", path], { user: "root", timeoutSec: 10 });
			if (result.exitCode !== 0) throw new Error("Failed to read probe file");
			return result.stdout;
		},
		exec: (command, timeoutSec) => exec(id, ["sh", "-c", command], { user: "root", timeoutSec }),
		async assertions() {
			const inspect = await docker(
				[
					"container",
					"inspect",
					"--format",
					"{{.HostConfig.Runtime}} {{.HostConfig.NetworkMode}}",
					id,
				],
				{ timeoutMs: 15_000 },
			);
			const [runtime, network] = inspect.stdout.trim().split(" ");
			return {
				isolatedRuntime: runtime === ISOLATED_RUNTIME,
				noNetworkInterface: network === "none",
			};
		},
		destroy: () => provider.destroy(handle),
	};
}
