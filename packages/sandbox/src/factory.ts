import type { SandboxProvider } from "@legwork/contracts";
import {
	DockerSandboxProvider,
	dockerSandboxConfig,
	openDockerProbeSession,
	prepareDockerSandboxRuntime,
} from "./docker-provider";
import type { ProbeSession } from "./probe";
import { openRailwayProbeSession, RailwaySandboxProvider } from "./railway-provider";
import type { SandboxProviderOptions } from "./shared";
import { buildAnalysisTemplate } from "./template";

export type SandboxProviderKind = "railway" | "docker";

/** `SANDBOX_PROVIDER` selects the runtime; Railway stays the default until the cutover. */
export function sandboxProviderKind(env: NodeJS.ProcessEnv = process.env): SandboxProviderKind {
	const value = env.SANDBOX_PROVIDER || "railway";
	if (value !== "railway" && value !== "docker")
		throw new Error(`Unsupported SANDBOX_PROVIDER: ${value}`);
	return value;
}

export function createSandboxProvider(
	options: SandboxProviderOptions,
	env: NodeJS.ProcessEnv = process.env,
): SandboxProvider {
	if (sandboxProviderKind(env) === "docker")
		return new DockerSandboxProvider({ ...options, ...dockerSandboxConfig(env) });
	return new RailwaySandboxProvider(options);
}

/** Builds the Railway template, or checks the Docker runtime and image, before work starts. */
export async function prepareSandboxRuntime(
	env: NodeJS.ProcessEnv = process.env,
): Promise<SandboxProviderKind> {
	const kind = sandboxProviderKind(env);
	if (kind === "docker") await prepareDockerSandboxRuntime(dockerSandboxConfig(env));
	else await buildAnalysisTemplate();
	return kind;
}

export function openProbeSession(env: NodeJS.ProcessEnv = process.env): Promise<ProbeSession> {
	return sandboxProviderKind(env) === "docker"
		? openDockerProbeSession(dockerSandboxConfig(env))
		: openRailwayProbeSession();
}
