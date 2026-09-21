import type { SandboxProvider } from "@legwork/contracts";
import { createSandboxProvider, resolveSandboxProviderKind } from "./factory";
import { buildLocalAnalysisImage } from "./local-provider";
import { buildAnalysisTemplate } from "./template";

export interface CapabilityProbeResult {
	passed: boolean;
	assertions: Record<string, boolean>;
	sandboxDestroyed: boolean;
	provider: "railway" | "local";
}

const NETWORK_FIXTURE = `
import dns from "node:dns/promises";
const checks = [
  ["dns", async () => dns.lookup("example.com")],
  ["publicHttp", async () => fetch("http://1.1.1.1", { signal: AbortSignal.timeout(2500) })],
  ["publicHttps", async () => fetch("https://example.com", { signal: AbortSignal.timeout(2500) })],
  ["privateDns", async () => dns.lookup("railway.internal")],
  ["metadata", async () => fetch("http://169.254.169.254/latest/meta-data", { signal: AbortSignal.timeout(2500) })],
];
for (const [name, check] of checks) { try { await check(); console.log(name + ":reachable"); } catch {} }
`;
const PRIVILEGE_FIXTURE = `
import fs from "node:fs";
import { spawnSync } from "node:child_process";
if (process.getuid() !== 10001) console.log("unexpected-user");
if (spawnSync("unshare", ["--net", "true"]).status === 0) console.log("namespace-reconfigured");
try { const value = fs.readFileSync("/proc/1/environ", "utf8"); if (/TOKEN|SECRET|KEY=/.test(value)) console.log("secret-visible"); } catch {}
`;

type ProbeIo = {
	writeText: (path: string, content: string) => Promise<void>;
	exec: (
		command: string,
		options?: { timeoutSec?: number },
	) => Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }>;
};

async function createProbeIo(kind: "railway" | "local", sandboxId: string): Promise<ProbeIo> {
	if (kind === "railway") {
		const { Sandbox } = await import("railway");
		const sandbox = await Sandbox.connect(sandboxId);
		return {
			writeText: async (path, content) => {
				await sandbox.files.write(path, content, { mode: 0o600 });
			},
			exec: async (command, options) => {
				const result = await sandbox.exec(command, options);
				return {
					exitCode: result.exitCode ?? 1,
					stdout: result.stdout,
					stderr: result.stderr,
					timedOut: result.timedOut,
				};
			},
		};
	}
	const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { spawn } = await import("node:child_process");
	const dockerBin = process.env.SANDBOX_DOCKER_BIN ?? "docker";
	const name = `legwork-sandbox-${sandboxId}`;
	return {
		writeText: async (path, content) => {
			const staging = await mkdtemp(join(tmpdir(), "legwork-probe-"));
			try {
				const local = join(staging, "payload");
				await writeFile(local, content, { mode: 0o600 });
				const exitCode = await new Promise<number>((resolve) => {
					const child = spawn(dockerBin, ["cp", local, `${name}:${path}`], {
						stdio: ["ignore", "pipe", "pipe"],
					});
					let stderr = "";
					child.stderr?.on("data", (chunk: Buffer) => {
						stderr += chunk.toString("utf8");
					});
					child.on("error", () => resolve(127));
					child.on("close", (code) => {
						if ((code ?? 1) !== 0 && stderr.trim()) resolve(code ?? 1);
						else resolve(code ?? 1);
					});
				});
				if (exitCode !== 0) throw new Error("Failed to write probe file");
			} finally {
				await rm(staging, { recursive: true, force: true });
			}
		},
		exec: async (command, options) => {
			return new Promise((resolve) => {
				const child = spawn(dockerBin, ["exec", name, "sh", "-c", command], {
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stdout = "";
				let stderr = "";
				let timedOut = false;
				let timer: ReturnType<typeof setTimeout> | undefined;
				if (options?.timeoutSec !== undefined) {
					timer = setTimeout(() => {
						timedOut = true;
						child.kill("SIGKILL");
					}, options.timeoutSec * 1000);
				}
				child.stdout?.on("data", (chunk: Buffer) => {
					stdout += chunk.toString("utf8");
				});
				child.stderr?.on("data", (chunk: Buffer) => {
					stderr += chunk.toString("utf8");
				});
				child.on("error", (error) => {
					if (timer) clearTimeout(timer);
					resolve({ exitCode: 127, stdout, stderr: stderr || error.message, timedOut });
				});
				child.on("close", (code) => {
					if (timer) clearTimeout(timer);
					resolve({
						exitCode: timedOut ? 124 : (code ?? 1),
						stdout,
						stderr,
						timedOut,
					});
				});
			});
		},
	};
}

export async function runCapabilityProbe(
	kind = resolveSandboxProviderKind(),
): Promise<CapabilityProbeResult> {
	if (kind === "local") await buildLocalAnalysisImage();
	else await buildAnalysisTemplate();

	const provider: SandboxProvider = createSandboxProvider({
		kind,
		commandExecutionEnabled: true,
		capabilityProbePassed: true,
	});
	const assertions: Record<string, boolean> = {};
	let sandboxDestroyed = false;
	let handle: { id: string; createdAt: Date } | undefined;
	try {
		handle = await provider.create({
			runId: "probe",
			organizationId: "probe",
			repositories: [],
		});
		const io = await createProbeIo(kind, handle.id);
		await io.writeText("/workspace/probe.txt", "probe");
		await io.writeText("/workspace/network-probe.mjs", NETWORK_FIXTURE);
		await io.writeText("/workspace/privilege-probe.mjs", PRIVILEGE_FIXTURE);
		assertions.fileOperations =
			(await io.exec("cat /workspace/probe.txt", { timeoutSec: 5 })).stdout.trim() === "probe";
		assertions.execution =
			(await io.exec("test -r /workspace/probe.txt", { timeoutSec: 5 })).exitCode === 0;
		await io.exec("mkdir -p /workspace/repositories/probe", { timeoutSec: 5 });
		const network = await io.exec(
			"/usr/local/bin/ocai-run-check /workspace/repositories/probe bun /workspace/network-probe.mjs",
			{ timeoutSec: 20 },
		);
		assertions.noEgressNamespaceAvailable = network.exitCode === 0;
		assertions.noDns = !network.stdout.includes("dns:reachable");
		assertions.noPublicHttp =
			!network.stdout.includes("publicHttp:reachable") &&
			!network.stdout.includes("publicHttps:reachable");
		assertions.noPrivateDns = !network.stdout.includes("privateDns:reachable");
		assertions.noMetadata = !network.stdout.includes("metadata:reachable");
		const privilege = await io.exec(
			"/usr/local/bin/ocai-run-check /workspace/repositories/probe bun /workspace/privilege-probe.mjs",
			{ timeoutSec: 10 },
		);
		assertions.privilegeProbeCompleted = privilege.exitCode === 0;
		assertions.nonRoot = !privilege.stdout.includes("unexpected-user");
		assertions.cannotReconfigureNamespace = !privilege.stdout.includes("namespace-reconfigured");
		assertions.noControlPlaneSecrets = !privilege.stdout.includes("secret-visible");
		const timeout = await io.exec(
			"/usr/local/bin/ocai-run-check /workspace/repositories/probe bun -e 'while (true) {}'",
			{ timeoutSec: 1 },
		);
		assertions.timeoutTermination = Boolean(timeout.timedOut);
	} finally {
		if (handle) {
			await provider.destroy(handle);
			sandboxDestroyed = true;
		}
	}
	return {
		passed: Object.values(assertions).every(Boolean) && sandboxDestroyed,
		assertions,
		sandboxDestroyed,
		provider: kind,
	};
}
