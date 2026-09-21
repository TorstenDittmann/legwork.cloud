import type { SandboxProvider } from "@legwork/contracts";
import { LocalSandboxProvider, type LocalSandboxOptions } from "./local-provider";
import {
	MicrosandboxProvider,
	type MicrosandboxOptions,
	ensureMicrosandboxRuntime,
} from "./microsandbox-provider";
import type { SandboxExecutionOptions } from "./shared";

export type SandboxProviderKind = "microsandbox" | "docker";

export interface CreateSandboxProviderOptions extends SandboxExecutionOptions {
	kind?: SandboxProviderKind;
	image?: string;
	dockerBin?: string;
	toolsDir?: string;
	memoryMiB?: number;
	cpus?: number;
}

export function resolveSandboxProviderKind(
	explicit = process.env.SANDBOX_PROVIDER,
): SandboxProviderKind {
	if (explicit === "docker" || explicit === "local") return "docker";
	if (explicit === "microsandbox" || explicit === "railway") return "microsandbox";
	return "microsandbox";
}

export function createSandboxProvider(options: CreateSandboxProviderOptions): SandboxProvider {
	const kind = options.kind ?? resolveSandboxProviderKind();
	const shared: SandboxExecutionOptions = {
		commandExecutionEnabled: options.commandExecutionEnabled,
		capabilityProbePassed: options.capabilityProbePassed,
	};
	if (kind === "docker") {
		const local: LocalSandboxOptions = { ...shared };
		if (options.image !== undefined) local.image = options.image;
		if (options.dockerBin !== undefined) local.dockerBin = options.dockerBin;
		return new LocalSandboxProvider(local);
	}
	const microsandbox: MicrosandboxOptions = { ...shared };
	if (options.image !== undefined) microsandbox.image = options.image;
	if (options.toolsDir !== undefined) microsandbox.toolsDir = options.toolsDir;
	if (options.memoryMiB !== undefined) microsandbox.memoryMiB = options.memoryMiB;
	if (options.cpus !== undefined) microsandbox.cpus = options.cpus;
	return new MicrosandboxProvider(microsandbox);
}

export async function prepareSandboxBackend(kind = resolveSandboxProviderKind()): Promise<void> {
	if (kind === "docker") {
		const { buildLocalAnalysisImage } = await import("./local-provider");
		await buildLocalAnalysisImage();
		return;
	}
	await ensureMicrosandboxRuntime();
	const { ensureMicrosandboxTools } = await import("./microsandbox-provider");
	await ensureMicrosandboxTools();
}
