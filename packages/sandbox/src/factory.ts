import type { SandboxProvider } from "@legwork/contracts";
import {
	MicrosandboxProvider,
	type MicrosandboxOptions,
	ensureMicrosandboxRuntime,
	ensureMicrosandboxTools,
} from "./microsandbox-provider";
import type { SandboxExecutionOptions } from "./shared";

export type CreateSandboxProviderOptions = SandboxExecutionOptions &
	Pick<MicrosandboxOptions, "image" | "toolsDir" | "memoryMiB" | "cpus">;

export function createSandboxProvider(options: CreateSandboxProviderOptions): SandboxProvider {
	const microsandbox: MicrosandboxOptions = {
		commandExecutionEnabled: options.commandExecutionEnabled,
		capabilityProbePassed: options.capabilityProbePassed,
	};
	if (options.image !== undefined) microsandbox.image = options.image;
	if (options.toolsDir !== undefined) microsandbox.toolsDir = options.toolsDir;
	if (options.memoryMiB !== undefined) microsandbox.memoryMiB = options.memoryMiB;
	if (options.cpus !== undefined) microsandbox.cpus = options.cpus;
	return new MicrosandboxProvider(microsandbox);
}

export async function prepareSandboxBackend(): Promise<void> {
	await ensureMicrosandboxRuntime();
	await ensureMicrosandboxTools();
}
