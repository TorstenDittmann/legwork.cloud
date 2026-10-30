import type { SandboxProvider } from "@legwork/contracts";
import {
	DockerSandboxProvider,
	dockerSandboxConfig,
	isDockerSandboxId,
	openDockerProbeSession,
	prepareDockerSandboxRuntime,
} from "./docker-provider";
import type { ProbeSession } from "./probe";
import { openRailwayProbeSession, RailwaySandboxProvider } from "./railway-provider";
import {
	isSbxSandboxId,
	openSbxProbeSession,
	prepareSbxSandboxRuntime,
	SbxSandboxProvider,
	sbxSandboxConfig,
} from "./sbx-provider";
import type { SandboxProviderOptions } from "./shared";
import { buildAnalysisTemplate } from "./template";

export type SandboxProviderKind = "railway" | "docker" | "sbx";

/** `SANDBOX_PROVIDER` selects the runtime; Railway stays the default until the cutover. */
export function sandboxProviderKind(env: NodeJS.ProcessEnv = process.env): SandboxProviderKind {
	const value = env.SANDBOX_PROVIDER || "railway";
	if (value !== "railway" && value !== "docker" && value !== "sbx")
		throw new Error(`Unsupported SANDBOX_PROVIDER: ${value}`);
	return value;
}

export function createSandboxProvider(
	options: SandboxProviderOptions,
	env: NodeJS.ProcessEnv = process.env,
): SandboxProvider {
	const kind = sandboxProviderKind(env);
	if (kind === "sbx") return new SbxSandboxProvider({ ...options, ...sbxSandboxConfig(env) });
	if (kind === "docker")
		return new DockerSandboxProvider({ ...options, ...dockerSandboxConfig(env) });
	return new RailwaySandboxProvider(options);
}

/**
 * Provider that owns an existing sandbox, chosen from its ID format rather than
 * `SANDBOX_PROVIDER`, so cleanup still reaches sandboxes created before a switch.
 */
export function sandboxProviderFor(
	sandboxId: string,
	options: SandboxProviderOptions,
	env: NodeJS.ProcessEnv = process.env,
): SandboxProvider {
	if (isSbxSandboxId(sandboxId))
		return new SbxSandboxProvider({ ...options, ...sbxSandboxConfig(env) });
	if (isDockerSandboxId(sandboxId))
		return new DockerSandboxProvider({ ...options, ...dockerSandboxConfig(env) });
	return new RailwaySandboxProvider(options);
}

/** Builds the Railway template, or checks the Docker or sbx runtime, before work starts. */
export async function prepareSandboxRuntime(
	env: NodeJS.ProcessEnv = process.env,
): Promise<SandboxProviderKind> {
	const kind = sandboxProviderKind(env);
	if (kind === "sbx") await prepareSbxSandboxRuntime(sbxSandboxConfig(env));
	else if (kind === "docker") await prepareDockerSandboxRuntime(dockerSandboxConfig(env));
	else await buildAnalysisTemplate();
	return kind;
}

export function openProbeSession(env: NodeJS.ProcessEnv = process.env): Promise<ProbeSession> {
	const kind = sandboxProviderKind(env);
	if (kind === "sbx") return openSbxProbeSession(sbxSandboxConfig(env));
	if (kind === "docker") return openDockerProbeSession(dockerSandboxConfig(env));
	return openRailwayProbeSession();
}
