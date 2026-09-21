import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { arch as osArch, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { TextDecoder } from "node:util";
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
import {
	ExecTimeoutError,
	MiB,
	NetworkPolicy,
	Sandbox,
	SandboxNotFoundError,
	type Sandbox as MicrosandboxInstance,
} from "microsandbox";
import { shellQuote } from "./commands";
import {
	bounded,
	buildCheckArgv,
	classifyCheckResult,
	commandExecutionBlocked,
	consumeBootstrapProgress,
	inspectOperation,
	loadSandboxScript,
	repositoryRoot,
	sandboxHandle,
	type SandboxExecutionOptions,
	validateRepositoryManifest,
} from "./shared";

export interface MicrosandboxOptions extends SandboxExecutionOptions {
	/** OCI image used as the analysis rootfs. Defaults to python:3.12-slim-bookworm. */
	image?: string;
	/** Host directory for cached static tools (bun, ripgrep). */
	toolsDir?: string;
	memoryMiB?: number;
	cpus?: number;
}

const DEFAULT_IMAGE = "python:3.12-slim-bookworm";
const BUN_VERSION = "1.4.0";
const RIPGREP_VERSION = "14.1.1";

function sandboxName(id: string): string {
	return `legwork-${id}`;
}

function parseId(handle: SandboxHandle): string {
	return handle.id.startsWith("legwork-") ? handle.id.slice("legwork-".length) : handle.id;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function hostArch(): { bun: string; ripgrep: string } {
	switch (osArch()) {
		case "arm64":
			return { bun: "aarch64", ripgrep: "aarch64-unknown-linux-gnu" };
		default:
			return { bun: "x64", ripgrep: "x86_64-unknown-linux-musl" };
	}
}

async function download(url: string, destination: string): Promise<void> {
	const response = await fetch(url, {
		headers: { "User-Agent": "legwork-sandbox" },
		redirect: "follow",
	});
	if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
	await writeFile(destination, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
}

async function runHost(command: string, args: string[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
		let stderr = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
		});
	});
}

export async function ensureMicrosandboxTools(
	toolsDir = join(tmpdir(), "legwork-sandbox-tools"),
): Promise<{ bun: string; ripgrep: string }> {
	await mkdir(toolsDir, { recursive: true });
	const { bun: bunArch, ripgrep: rgArch } = hostArch();
	const bunPath = join(toolsDir, `bun-${BUN_VERSION}-${bunArch}`);
	const rgPath = join(toolsDir, `rg-${RIPGREP_VERSION}-${rgArch}`);
	if (!(await pathExists(bunPath))) {
		const archive = join(toolsDir, `bun-${BUN_VERSION}.zip`);
		await download(
			`https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${bunArch}.zip`,
			archive,
		);
		const staging = join(toolsDir, `bun-extract-${BUN_VERSION}`);
		await mkdir(staging, { recursive: true });
		await runHost("unzip", ["-qo", archive, "-d", staging]);
		const extracted = join(staging, `bun-linux-${bunArch}`, "bun");
		await writeFile(bunPath, await readFile(extracted), { mode: 0o755 });
		await chmod(bunPath, 0o755);
	}
	if (!(await pathExists(rgPath))) {
		const archive = join(toolsDir, `rg-${RIPGREP_VERSION}.tar.gz`);
		await download(
			`https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/ripgrep-${RIPGREP_VERSION}-${rgArch}.tar.gz`,
			archive,
		);
		const staging = join(toolsDir, `rg-extract-${RIPGREP_VERSION}`);
		await mkdir(staging, { recursive: true });
		await runHost("tar", ["-xzf", archive, "-C", staging]);
		const extracted = join(staging, `ripgrep-${RIPGREP_VERSION}-${rgArch}`, "rg");
		await writeFile(rgPath, await readFile(extracted), { mode: 0o755 });
		await chmod(rgPath, 0o755);
	}
	return { bun: bunPath, ripgrep: rgPath };
}

function githubArchivePolicy() {
	return NetworkPolicy.builder()
		.defaultDeny()
		.egress((egress) => egress.allowDomain("codeload.github.com"))
		.build();
}

async function connectSandbox(handle: SandboxHandle): Promise<MicrosandboxInstance> {
	const existing = await Sandbox.get(sandboxName(parseId(handle)));
	return existing.connectOrStart();
}

async function execShell(
	sandbox: MicrosandboxInstance,
	command: string,
	options: { timeoutSec?: number; cwd?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
	try {
		const result = await sandbox.execWith("sh", (exec) => {
			let builder = exec.args(["-c", command]);
			if (options.cwd) builder = builder.cwd(options.cwd);
			if (options.timeoutSec !== undefined) builder = builder.timeout(options.timeoutSec * 1000);
			return builder;
		});
		return {
			exitCode: result.code ?? 1,
			stdout: result.stdout(),
			stderr: result.stderr(),
			timedOut: false,
		};
	} catch (error) {
		if (error instanceof ExecTimeoutError) {
			return { exitCode: 124, stdout: "", stderr: error.message, timedOut: true };
		}
		throw error;
	}
}

function decodeChunk(data: Uint8Array | string): string {
	if (typeof data === "string") return data;
	return new TextDecoder().decode(data);
}

export class MicrosandboxProvider implements SandboxProvider {
	private readonly image: string;
	private readonly toolsDir: string;
	private readonly memoryMiB: number;
	private readonly cpus: number;

	constructor(private readonly options: MicrosandboxOptions) {
		this.image = options.image ?? process.env.SANDBOX_IMAGE ?? DEFAULT_IMAGE;
		this.toolsDir = options.toolsDir ?? join(tmpdir(), "legwork-sandbox-tools");
		this.memoryMiB = options.memoryMiB ?? Number(process.env.SANDBOX_MEMORY_MIB ?? "2048");
		this.cpus = options.cpus ?? Number(process.env.SANDBOX_CPUS ?? "2");
	}

	async health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy"> {
		try {
			const sandbox = await connectSandbox(handle);
			const result = await execShell(sandbox, "true", { timeoutSec: 5 });
			return result.exitCode === 0 && !result.timedOut ? "ready" : "unhealthy";
		} catch (error) {
			if (error instanceof SandboxNotFoundError) return "missing";
			const message = error instanceof Error ? error.message : "";
			return /not found|does not exist|destroyed/i.test(message) ? "missing" : "unhealthy";
		}
	}

	async create(run: RunContext): Promise<SandboxHandle> {
		const tools = await ensureMicrosandboxTools(this.toolsDir);
		const id = createHash("sha256")
			.update(`${run.runId}:${crypto.randomUUID()}`)
			.digest("hex")
			.slice(0, 16);
		const name = sandboxName(id);
		const sandbox = await Sandbox.builder(name)
			.image(this.image)
			.cpus(this.cpus)
			.memory(MiB(this.memoryMiB))
			.network((network) => network.policy(githubArchivePolicy()))
			.workdir("/workspace")
			.env("OCAI_RUN_ID", run.runId)
			.patch((patch) =>
				patch
					.mkdir("/workspace", { mode: 0o755 })
					.mkdir("/home/analyst", { mode: 0o755 })
					.mkdir("/workspace/repositories", { mode: 0o700 })
					.copyFile(tools.bun, "/usr/local/bin/bun", { mode: 0o755, replace: true })
					.copyFile(tools.ripgrep, "/usr/local/bin/rg", { mode: 0o755, replace: true })
					.text(
						"/usr/local/bin/ocai-bootstrap-repositories",
						loadSandboxScript("ocai-bootstrap-repositories.py"),
						{ mode: 0o755, replace: true },
					)
					.text("/usr/local/bin/ocai-run-check", loadSandboxScript("ocai-run-check.sh"), {
						mode: 0o755,
						replace: true,
					}),
			)
			.detached(true)
			.ephemeral(true)
			.replace()
			.create();
		const setup = await execShell(
			sandbox,
			"id -u analyst >/dev/null 2>&1 || useradd --create-home --uid 10001 --shell /usr/sbin/nologin analyst; chown -R 10001:10001 /home/analyst /workspace",
			{ timeoutSec: 30 },
		);
		if (setup.exitCode !== 0)
			throw new Error(setup.stderr.trim() || "Failed to provision analyst user in sandbox");
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
		const sandbox = await connectSandbox(handle);
		const fs = sandbox.fs();
		await fs.write("/workspace/bootstrap-manifest.json", JSON.stringify(manifest));
		await fs.write("/workspace/incident.json", Buffer.from(incident));
		const pending = { value: "" };
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let exitCode = 1;
		const stream = await sandbox.execStream("python3", [
			"/usr/local/bin/ocai-bootstrap-repositories",
			"/workspace/bootstrap-manifest.json",
		]);
		const timer = setTimeout(() => {
			timedOut = true;
			void stream.kill();
		}, 180_000);
		try {
			for await (const event of stream) {
				if (event.kind === "stdout") {
					const chunk = decodeChunk(event.data);
					stdout += chunk;
					consumeBootstrapProgress(chunk, pending, onProgress);
				} else if (event.kind === "stderr") {
					stderr += decodeChunk(event.data);
				} else if (event.kind === "exited") {
					exitCode = event.code ?? 1;
				}
			}
		} catch (error) {
			if (error instanceof ExecTimeoutError) timedOut = true;
			else throw error;
		} finally {
			clearTimeout(timer);
		}
		if (exitCode !== 0 || timedOut) {
			await fs.remove("/workspace/incident.json").catch(() => undefined);
			throw new Error(
				timedOut
					? "Repository bootstrap timed out"
					: stderr.trim() || stdout.trim() || "Repository bootstrap failed",
			);
		}
		const ownership = await execShell(sandbox, "chown 10001:10001 /workspace/incident.json", {
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
		const sandbox = await connectSandbox(handle);
		const fs = sandbox.fs();
		return inspectOperation(
			operation,
			{
				readFile: (path) => fs.readToString(path),
				exec: (command, options) => execShell(sandbox, command, options),
			},
			started,
		);
	}

	async runCheck(handle: SandboxHandle, request: CheckRequest): Promise<ToolResult> {
		const started = performance.now();
		const blocked = commandExecutionBlocked(this.options);
		if (blocked) return blocked;
		const sandbox = await connectSandbox(handle);
		const root = repositoryRoot(request.repositoryId);
		try {
			const entries = await sandbox.fs().list(root);
			const names = new Set(entries.map((entry) => basename(entry.path)));
			let packageJson: unknown;
			if (names.has("package.json"))
				packageJson = JSON.parse(await sandbox.fs().readToString(`${root}/package.json`));
			const discovered = buildCheckArgv(root, names, packageJson, request);
			if (discovered.unavailable)
				return {
					...discovered.unavailable,
					durationMs: Math.round(performance.now() - started),
				};
			const result = await execShell(sandbox, discovered.argv.map(shellQuote).join(" "), {
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
		try {
			const existing = await Sandbox.get(sandboxName(parseId(handle)));
			await existing.destroy({ force: true, timeoutMs: 15_000 });
		} catch (error) {
			if (error instanceof SandboxNotFoundError) return;
			throw error;
		}
	}
}

export async function ensureMicrosandboxRuntime(): Promise<void> {
	const { ensureRuntime } = await import("microsandbox");
	await ensureRuntime();
}
