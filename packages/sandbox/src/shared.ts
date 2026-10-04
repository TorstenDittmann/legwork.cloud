import type { SandboxRepositoryManifest, ToolResult } from "@legwork/contracts";
import type { DiscoveredCommand } from "./commands";

export const MAX_OUTPUT = 64 * 1024;
export const WORKSPACE = "/workspace/repositories";
export const ANALYST_UID = 10001;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface SandboxProviderOptions {
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

/** Path the bootstrap accepts for an archive streamed in by a provider without sandbox egress. */
export function stagedArchivePath(repositoryId: string): string {
	if (!UUID_PATTERN.test(repositoryId)) throw new Error("Invalid repository identifier");
	return `/tmp/ocai-archive-${repositoryId}.tar.gz`;
}

export function numberLines(lines: string[], start: number): string {
	return lines.map((line, index) => `${start + index}: ${line}`).join("\n");
}

/** Arguments for `ocai-run-check`, which applies the no-egress, unprivileged boundary. */
export function checkArgv(root: string, command: DiscoveredCommand): string[] {
	const assignments = Object.entries(command.environment).map(([key, value]) => {
		if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error("Invalid check environment name");
		return `${key}=${value}`;
	});
	return [
		"/usr/local/bin/ocai-run-check",
		root,
		"env",
		...assignments,
		command.executable,
		...command.args,
	];
}

export function checkResult(
	result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean },
	durationMs: number,
): ToolResult {
	const output = bounded([result.stdout, result.stderr].filter(Boolean).join("\n"));
	if (result.timedOut) return { status: "timed_out", ...output, durationMs };
	const unavailable =
		result.exitCode === 127 ||
		/not found|missing dependency|cannot find module/i.test(output.output);
	return {
		status: unavailable ? "unavailable" : result.exitCode === 0 ? "ok" : "error",
		...output,
		durationMs,
		...(unavailable ? { limitation: "Required offline dependencies are unavailable" } : {}),
	};
}

export function unavailableCheck(limitation: string, durationMs = 0): ToolResult {
	return { status: "unavailable", output: "", truncated: false, durationMs, limitation };
}

export function errorResult(error: unknown, fallback: string, durationMs: number): ToolResult {
	return {
		status: "error",
		output: error instanceof Error ? error.message : fallback,
		truncated: false,
		durationMs,
	};
}
