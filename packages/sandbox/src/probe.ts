import type { SandboxProvider } from "@legwork/contracts";
import { createSandboxProvider, prepareSandboxBackend } from "./factory";

export interface CapabilityProbeResult {
	passed: boolean;
	assertions: Record<string, boolean>;
	sandboxDestroyed: boolean;
}

const NETWORK_FIXTURE = `
import dns from "node:dns/promises";
const checks = [
  ["dns", async () => dns.lookup("example.com")],
  ["publicHttp", async () => fetch("http://1.1.1.1", { signal: AbortSignal.timeout(2500) })],
  ["publicHttps", async () => fetch("https://example.com", { signal: AbortSignal.timeout(2500) })],
  ["privateDns", async () => dns.lookup("metadata.google.internal")],
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

async function createProbeIo(sandboxId: string): Promise<ProbeIo> {
	const { Sandbox, ExecTimeoutError } = await import("microsandbox");
	const sandbox = await (await Sandbox.get(`legwork-${sandboxId}`)).connectOrStart();
	return {
		writeText: async (path, content) => {
			await sandbox.fs().write(path, content);
		},
		exec: async (command, options) => {
			try {
				const result = await sandbox.execWith("sh", (exec) => {
					let builder = exec.args(["-c", command]);
					if (options?.timeoutSec !== undefined)
						builder = builder.timeout(options.timeoutSec * 1000);
					return builder;
				});
				return {
					exitCode: result.code ?? 1,
					stdout: result.stdout(),
					stderr: result.stderr(),
					timedOut: false,
				};
			} catch (error) {
				if (error instanceof ExecTimeoutError)
					return { exitCode: 124, stdout: "", stderr: error.message, timedOut: true };
				throw error;
			}
		},
	};
}

export async function runCapabilityProbe(): Promise<CapabilityProbeResult> {
	await prepareSandboxBackend();
	const provider: SandboxProvider = createSandboxProvider({
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
		const io = await createProbeIo(handle.id);
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
	};
}
