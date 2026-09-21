import type { SandboxProvider } from "@legwork/contracts";
import { LocalSandboxProvider, type LocalSandboxOptions } from "./local-provider";
import { RailwaySandboxProvider, type RailwaySandboxOptions } from "./provider";
import type { SandboxExecutionOptions } from "./shared";

export type SandboxProviderKind = "railway" | "local";

export interface CreateSandboxProviderOptions extends SandboxExecutionOptions {
	kind?: SandboxProviderKind;
	image?: string;
	dockerBin?: string;
}

export function resolveSandboxProviderKind(
	explicit = process.env.SANDBOX_PROVIDER,
	railwayToken = process.env.RAILWAY_TOKEN,
): SandboxProviderKind {
	if (explicit === "railway" || explicit === "local") return explicit;
	return railwayToken ? "railway" : "local";
}

export function createSandboxProvider(options: CreateSandboxProviderOptions): SandboxProvider {
	const kind = options.kind ?? resolveSandboxProviderKind();
	const shared: SandboxExecutionOptions = {
		commandExecutionEnabled: options.commandExecutionEnabled,
		capabilityProbePassed: options.capabilityProbePassed,
	};
	if (kind === "local") {
		const local: LocalSandboxOptions = { ...shared };
		if (options.image !== undefined) local.image = options.image;
		if (options.dockerBin !== undefined) local.dockerBin = options.dockerBin;
		return new LocalSandboxProvider(local);
	}
	const railway: RailwaySandboxOptions = shared;
	return new RailwaySandboxProvider(railway);
}
