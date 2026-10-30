import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
	type BuildStep,
	type CreateTemplateOptions,
	SbxClient,
	SbxError,
} from "@sbx.torsten.work/sbx";
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
import type { ProbeSession } from "./probe";
import {
	bounded,
	checkArgv,
	checkResult,
	errorResult,
	numberLines,
	repositoryRoot,
	type SandboxProviderOptions,
	UUID_PATTERN,
	unavailableCheck,
	validateRepositoryManifest,
} from "./shared";
import { sandboxScript } from "./template";

/** Same base as image/Dockerfile, pinned by digest. */
const BASE_IMAGE =
	"debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251";
/** gVisor: the only backend under which repository commands may run. */
export const SBX_ISOLATED_BACKEND = "gvisor";
/** The UID sbx runs every sandbox command as. */
export const SBX_SANDBOX_UID = 1000;
const CHECK_WRAPPER = "/usr/local/bin/ocai-run-check-sbx";
// sbx gives /tmp only a small tmpfs, so archives are staged on the /workspace tmpfs.
const STAGING = "/workspace/.staged";
const INCIDENT_PATH = "/workspace/incident.json";
const MANIFEST_PATH = "/workspace/bootstrap-manifest.json";
const MAX_COMPRESSED = 250 * 1024 * 1024;
const MAX_READ = 4 * 1024 * 1024;
const SANDBOX_ID = /^sbx_[0-9a-f]{16}$/;
const RUN_LABEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[0-9]{1,6})?$/i;

/** sbx sandbox IDs are `sbx_` and 16 hex characters. */
export function isSbxSandboxId(id: string): boolean {
	return SANDBOX_ID.test(id);
}

export interface SbxSandboxConfig {
	url: string;
	apiKey: string;
}

export interface SbxSandboxOptions extends SandboxProviderOptions, SbxSandboxConfig {}

export function sbxSandboxConfig(env: NodeJS.ProcessEnv = process.env): SbxSandboxConfig {
	return { url: env.SBX_URL ?? "", apiKey: env.SBX_API_KEY ?? "" };
}

function sbxClient(config: SbxSandboxConfig): SbxClient {
	if (!config.url || !config.apiKey) throw new Error("SBX_URL and SBX_API_KEY must be set");
	return new SbxClient({ baseUrl: config.url, apiKey: config.apiKey });
}

// Mirrors image/Dockerfile. It contains tools only: no runtime or control-plane credential
// is baked in. There is no analyst account: sbx runs every command as one unprivileged user.
export function sbxAnalysisSteps(): BuildStep[] {
	return [
		{
			packages: [
				"ca-certificates",
				"curl",
				"unzip",
				"python3",
				"golang-go",
				"rustc",
				"cargo",
				"ripgrep",
				"git",
				"jq",
				"tar",
				"util-linux",
				"procps",
			],
		},
		{
			run: `set -eu
arch="$(uname -m)"
case "$arch" in
  x86_64) bun_arch="x64" ;;
  aarch64|arm64) bun_arch="aarch64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac
curl --fail --silent --show-error --location \\
  "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-linux-$bun_arch.zip" \\
  --output /tmp/bun.zip
unzip -q /tmp/bun.zip -d /tmp/bun-release
install -m 0755 "/tmp/bun-release/bun-linux-$bun_arch/bun" /usr/local/bin/bun
rm -rf /tmp/bun.zip /tmp/bun-release
bun --version`,
		},
		{
			run: `cat >/usr/local/bin/ocai-bootstrap-repositories <<'PYTHON'
${sandboxScript("ocai-bootstrap-repositories.py")}PYTHON
chmod 0755 /usr/local/bin/ocai-bootstrap-repositories`,
		},
		{
			run: `cat >${CHECK_WRAPPER} <<'SCRIPT'
${sandboxScript("ocai-run-check-sbx.sh")}SCRIPT
chmod 0755 ${CHECK_WRAPPER}`,
		},
	];
}

/**
 * Template options for the analysis sandbox. The name carries a hash of the image and
 * steps, so a changed script needs a new template instead of silently using a stale one.
 */
export function sbxAnalysisTemplate(): CreateTemplateOptions & { name: string } {
	const steps = sbxAnalysisSteps();
	const digest = createHash("sha256")
		.update(JSON.stringify({ image: BASE_IMAGE, steps }))
		.digest("hex")
		.slice(0, 12);
	return {
		name: `legwork-analysis-${digest}`,
		image: BASE_IMAGE,
		description: "Legwork analysis sandbox",
		cpu: 2,
		memoryMb: 4096,
		diskMb: 4096,
		backend: SBX_ISOLATED_BACKEND,
		network: "none",
		steps,
	};
}

/** Creates the analysis template. Needs an admin key; the worker itself only holds a sandbox key. */
export async function createSbxAnalysisTemplate(config: SbxSandboxConfig): Promise<string> {
	const template = sbxAnalysisTemplate();
	try {
		await sbxClient(config).createTemplate(template);
	} catch (error) {
		if (!(error instanceof SbxError && error.status === 409)) throw error;
	}
	return template.name;
}

/** Confirms gVisor is available and the current analysis template exists before work starts. */
export async function prepareSbxSandboxRuntime(config: SbxSandboxConfig): Promise<void> {
	const client = sbxClient(config);
	const backends = await client.listBackends();
	if (!backends.some((backend) => backend.name === SBX_ISOLATED_BACKEND && backend.available))
		throw new Error(`sbx backend ${SBX_ISOLATED_BACKEND} is not available`);
	const { name } = sbxAnalysisTemplate();
	const templates = await client.listTemplates();
	if (!templates.some((template) => template.name === name))
		throw new Error(
			`sbx template ${name} is missing; create it with \`bun run --filter @legwork/sandbox sbx:template\` and an admin key`,
		);
}

function sandboxId(handle: SandboxHandle): string {
	if (!SANDBOX_ID.test(handle.id)) throw new Error("Invalid sandbox identifier");
	return handle.id;
}

function isNotFound(error: unknown): boolean {
	return error instanceof SbxError && (error.status === 404 || error.code === "not_found");
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

interface ExecOptions {
	timeoutSec: number;
	cwd?: string;
	onStdout?: (chunk: string) => void;
}

async function exec(
	client: SbxClient,
	id: string,
	command: string[],
	options: ExecOptions,
): Promise<CommandResult> {
	// sbx kills a command at its own timeout with 137; `timeout` inside the sandbox reports 124
	// first, so a deadline is told apart from a process killed for another reason.
	const argv = ["timeout", "--kill-after=5", String(options.timeoutSec), ...command];
	const request = {
		...(options.cwd ? { cwd: options.cwd } : {}),
		timeout: options.timeoutSec + 15,
	};
	if (!options.onStdout) {
		const result = await client.exec(id, argv, request);
		return {
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			timedOut:
				result.exitCode === 124 ||
				(result.exitCode === 137 && result.durationMs >= options.timeoutSec * 1_000),
		};
	}
	let stdout = "";
	let stderr = "";
	for await (const event of client.execStream(id, argv, request)) {
		if (event.type === "stdout") {
			stdout = (stdout + event.data).slice(-MAX_READ);
			options.onStdout(event.data);
		} else if (event.type === "stderr") stderr = (stderr + event.data).slice(-MAX_READ);
		else if (event.type === "error") throw new Error(event.message ?? "Sandbox command failed");
		else {
			const exitCode = event.exitCode ?? 137;
			return {
				exitCode,
				stdout,
				stderr,
				timedOut:
					exitCode === 124 ||
					(exitCode === 137 && (event.durationMs ?? 0) >= options.timeoutSec * 1_000),
			};
		}
	}
	throw new Error("Sandbox command stream ended without an exit status");
}

function octal(value: number, width: number): string {
	return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

/**
 * A one-entry ustar archive around a codeload tarball. sbx's archive upload then places it
 * as a plain file, and the in-sandbox bootstrap validates and extracts it as on every provider.
 */
export function singleFileTar(name: string, content: Uint8Array, mode = 0o600): Uint8Array {
	if (Buffer.byteLength(name) > 99) throw new Error("Archive entry name is too long");
	const header = Buffer.alloc(512);
	header.write(name, 0, "utf8");
	header.write(octal(mode, 8), 100);
	header.write(octal(0, 8), 108);
	header.write(octal(0, 8), 116);
	header.write(octal(content.byteLength, 12), 124);
	header.write(octal(0, 12), 136);
	header.fill(" ", 148, 156);
	header.write("0", 156);
	header.write("ustar\0", 257);
	header.write("00", 263);
	let checksum = 0;
	for (const byte of header) checksum += byte;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
	const padding = (512 - (content.byteLength % 512)) % 512;
	return Buffer.concat([header, content, Buffer.alloc(padding + 1024)]);
}

async function downloadArchive(url: string, budget: { compressed: number }): Promise<Buffer> {
	const response = await fetch(url, {
		redirect: "error",
		headers: { "User-Agent": "legwork-sandbox" },
		signal: AbortSignal.timeout(120_000),
	});
	if (response.status !== 200 || !response.body) throw new Error("Repository download failed");
	const chunks: Uint8Array[] = [];
	const reader = response.body.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			budget.compressed += value.byteLength;
			if (budget.compressed > MAX_COMPRESSED)
				throw new Error("Archive compressed size limit exceeded");
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	return Buffer.concat(chunks);
}

function stagedName(repositoryId: string): string {
	if (!UUID_PATTERN.test(repositoryId)) throw new Error("Invalid repository identifier");
	return `ocai-archive-${repositoryId}.tar.gz`;
}

/**
 * Runs each analysis in an sbx sandbox on gVisor with no network, no capabilities and a
 * non-root user. Because the sandbox has no egress at all, the worker downloads each
 * exact-SHA archive and uploads it, and the in-sandbox bootstrap validates and extracts it.
 */
export class SbxSandboxProvider implements SandboxProvider {
	private readonly client: SbxClient;

	constructor(private readonly options: SbxSandboxOptions) {
		this.client = sbxClient(options);
	}

	async health(handle: SandboxHandle): Promise<"ready" | "missing" | "unhealthy"> {
		// A handle from another provider can never name one of our sandboxes.
		if (!isSbxSandboxId(handle.id)) return "missing";
		try {
			const sandbox = await this.client.getSandbox(handle.id);
			if (sandbox.status === "running") return "ready";
			return sandbox.status === "stopped" || sandbox.status === "error" ? "missing" : "unhealthy";
		} catch (error) {
			return isNotFound(error) ? "missing" : "unhealthy";
		}
	}

	async create(run: RunContext): Promise<SandboxHandle> {
		// The graph labels each sandbox generation as `<run uuid>-<generation>`.
		if (!RUN_LABEL.test(run.runId)) throw new Error("Invalid run identifier");
		const sandbox = await this.client.createSandbox({
			template: sbxAnalysisTemplate().name,
			backend: SBX_ISOLATED_BACKEND,
			network: { mode: "none" },
			// The server deletes the sandbox even if every destroy path fails; the janitor
			// is the second line of recovery.
			ttl: "30m",
			idleTimeout: "10m",
			labels: { "legwork.sandbox": "true", "legwork.run-id": run.runId },
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
		const id = sandboxId(handle);
		try {
			await this.client.writeFile(id, INCIDENT_PATH, incident, 0o600);
			await this.client.mkdir(id, STAGING, 0o700);
			const budget = { compressed: 0 };
			const total = manifest.repositories.length;
			for (const [offset, repository] of manifest.repositories.entries()) {
				onProgress?.({
					phase: "downloading",
					repositoryId: repository.repositoryId,
					index: offset + 1,
					total,
				});
				const archive = await downloadArchive(repository.downloadUrl, budget);
				await this.client.uploadArchive(
					id,
					STAGING,
					singleFileTar(stagedName(repository.repositoryId), archive),
				);
			}
			await this.client.writeFile(
				id,
				MANIFEST_PATH,
				JSON.stringify({
					repositories: manifest.repositories.map((repository) => ({
						repositoryId: repository.repositoryId,
						sha: repository.sha,
						archivePath: `${STAGING}/${stagedName(repository.repositoryId)}`,
					})),
				}),
				0o600,
			);
			let pending = "";
			const result = await exec(
				this.client,
				id,
				["/usr/local/bin/ocai-bootstrap-repositories", MANIFEST_PATH],
				{
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
				},
			);
			if (result.exitCode !== 0 || result.timedOut)
				throw new Error(
					result.timedOut ? "Repository bootstrap timed out" : "Repository bootstrap failed",
				);
		} catch (error) {
			await exec(this.client, id, ["rm", "-rf", INCIDENT_PATH, MANIFEST_PATH, STAGING], {
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
			const id = sandboxId(handle);
			const root = repositoryRoot(operation.repositoryId);
			if (operation.name === "read_file") {
				const safe = assertRelativeRepositoryPath(operation.path);
				if (!Number.isInteger(operation.start) || !Number.isInteger(operation.end))
					throw new Error("Invalid line range");
				const result = await exec(
					this.client,
					id,
					["sed", "-n", `${operation.start},${operation.end}p`, "--", `${root}/${safe}`],
					{ timeoutSec: 15 },
				);
				if (result.exitCode !== 0)
					return { status: "error", ...bounded(result.stderr), durationMs: elapsed() };
				const output = result.stdout.slice(0, MAX_READ);
				const lines = output.endsWith("\n") ? output.slice(0, -1).split("\n") : output.split("\n");
				return {
					status: "ok",
					...bounded(numberLines(lines, operation.start)),
					durationMs: elapsed(),
				};
			}
			if (operation.name === "list_tree") {
				const safe = assertRelativeRepositoryPath(operation.path);
				const result = await exec(
					this.client,
					id,
					["find", `${root}/${safe}`, "-maxdepth", String(operation.depth), "-printf", "%P\\n"],
					{ timeoutSec: 15 },
				);
				return {
					status: result.exitCode === 0 ? "ok" : "error",
					...bounded(result.stdout || result.stderr),
					durationMs: elapsed(),
				};
			}
			const glob = operation.glob ? ["--glob", operation.glob] : [];
			const result = await exec(
				this.client,
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
				{ timeoutSec: 20 },
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
		try {
			const id = sandboxId(handle);
			const root = repositoryRoot(request.repositoryId);
			const listing = await exec(this.client, id, ["ls", "-A", "--", root], { timeoutSec: 10 });
			if (listing.exitCode !== 0) throw new Error("Repository is not available");
			const names = new Set(listing.stdout.split("\n").filter(Boolean));
			let packageJson: unknown;
			if (names.has("package.json")) {
				const file = await exec(this.client, id, ["cat", "--", `${root}/package.json`], {
					timeoutSec: 10,
				});
				if (file.exitCode !== 0) throw new Error("package.json could not be read");
				packageJson = JSON.parse(file.stdout);
			}
			const discovered = discoverCheckCommand(names, packageJson, request.check);
			if (!discovered)
				return unavailableCheck(`No approved ${request.check} command was discovered`, elapsed());
			const result = await exec(this.client, id, checkArgv(root, discovered, CHECK_WRAPPER), {
				cwd: root,
				timeoutSec: 120,
			});
			return checkResult(result, elapsed());
		} catch (error) {
			return errorResult(error, "Check failed", elapsed());
		}
	}

	async destroy(handle: SandboxHandle): Promise<void> {
		try {
			await this.client.deleteSandbox(sandboxId(handle));
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
}

export async function openSbxProbeSession(config: SbxSandboxConfig): Promise<ProbeSession> {
	const provider = new SbxSandboxProvider({
		...config,
		commandExecutionEnabled: false,
		capabilityProbePassed: false,
	});
	const client = sbxClient(config);
	const handle = await provider.create({
		runId: crypto.randomUUID(),
		organizationId: "capability-probe",
		repositories: [],
	});
	const id = handle.id;
	return {
		checkWrapper: CHECK_WRAPPER,
		expectedUid: SBX_SANDBOX_UID,
		writeFile: (path, content) => client.writeFile(id, path, content),
		readFile: async (path) => Buffer.from(await client.readFile(id, path)).toString("utf8"),
		exec: (command, timeoutSec) => exec(client, id, ["sh", "-c", command], { timeoutSec }),
		async assertions() {
			const sandbox = await client.getSandbox(id);
			return {
				isolatedRuntime: sandbox.backend === SBX_ISOLATED_BACKEND,
				noNetworkInterface: sandbox.network === "none",
			};
		},
		destroy: () => provider.destroy(handle),
	};
}
