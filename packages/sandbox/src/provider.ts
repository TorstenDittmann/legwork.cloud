import { performance } from "node:perf_hooks";
import { Sandbox } from "railway";
import type {
	CheckRequest,
	InspectionOperation,
	RunContext,
	SandboxHandle,
	SandboxProvider,
	SourceFile,
	ToolResult,
} from "@oncall-ai/contracts";
import { assertRelativeRepositoryPath } from "@oncall-ai/security";
import { discoverCheckCommand, shellQuote } from "./commands";
import { analysisTemplate } from "./template";

const MAX_OUTPUT = 64 * 1024;
const WORKSPACE = "/workspace/repositories";

export interface RailwaySandboxOptions {
	commandExecutionEnabled: boolean;
	capabilityProbePassed: boolean;
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

	async create(run: RunContext): Promise<SandboxHandle> {
		const sandbox = await Sandbox.create(analysisTemplate(), {
			idleTimeoutMinutes: 10,
			networkIsolation: "ISOLATED",
			env: { OCAI_RUN_ID: run.runId },
		});
		return { id: sandbox.id, createdAt: new Date(), metadata: { runId: run.runId } };
	}

	async upload(handle: SandboxHandle, files: AsyncIterable<SourceFile>): Promise<void> {
		const sandbox = await Sandbox.connect(handle.id);
		for await (const file of files) {
			const relative = assertRelativeRepositoryPath(file.path);
			await sandbox.files.write(`/workspace/${relative}`, file.content, {
				mode: file.mode ?? 0o644,
			});
		}
		const ownership = await sandbox.exec("chown -R 10001:10001 /workspace/repositories", {
			timeoutSec: 30,
		});
		if (ownership.exitCode !== 0)
			throw new Error("Failed to assign repository workspace to the analysis user");
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
