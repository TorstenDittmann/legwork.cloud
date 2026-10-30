import { ANALYST_UID } from "./shared";

export interface CapabilityProbeResult {
	passed: boolean;
	assertions: Record<string, boolean>;
	sandboxDestroyed: boolean;
}

export interface ProbeExecResult {
	exitCode: number | null;
	stdout: string;
	timedOut: boolean;
}

/** A freshly created sandbox on the provider under test. Commands run as the sandbox's root. */
export interface ProbeSession {
	writeFile(path: string, content: string): Promise<void>;
	readFile(path: string): Promise<string>;
	exec(command: string, timeoutSec: number): Promise<ProbeExecResult>;
	destroy(): Promise<void>;
	/** Wrapper that applies the provider's check boundary. Defaults to `ocai-run-check`. */
	checkWrapper?: string;
	/** UID repository commands must run as. Defaults to the analyst account. */
	expectedUid?: number;
	/** Provider-specific assertions, such as the isolation runtime in use. */
	assertions?(): Promise<Record<string, boolean>>;
}

const NETWORK_FIXTURE = `
import dns from "node:dns/promises";
const reach = (url) => fetch(url, { signal: AbortSignal.timeout(2500) });
const checks = [
  ["dns", async () => dns.lookup("example.com")],
  ["publicHttp", async () => reach("http://1.1.1.1")],
  ["publicHttps", async () => reach("https://example.com")],
  ["privateDns", async () => dns.lookup("railway.internal")],
  ["privateDns", async () => dns.lookup("host.docker.internal")],
  ["privateHttp", async () => reach("http://10.0.0.1")],
  ["privateHttp", async () => reach("http://172.17.0.1")],
  ["privateHttp", async () => reach("http://192.168.0.1")],
  ["metadata", async () => reach("http://169.254.169.254/latest/meta-data")],
];
for (const [name, check] of checks) { try { await check(); console.log(name + ":reachable"); } catch {} }
`;
const privilegeFixture = (uid: number) => `
import fs from "node:fs";
import { spawnSync } from "node:child_process";
if (process.getuid() !== ${uid}) console.log("unexpected-user");
if (spawnSync("unshare", ["--net", "true"]).status === 0) console.log("namespace-reconfigured");
try { const value = fs.readFileSync("/proc/1/environ", "utf8"); if (/TOKEN|SECRET|KEY=/.test(value)) console.log("secret-visible"); } catch {}
`;

export async function runCapabilityProbe(
	open: () => Promise<ProbeSession>,
): Promise<CapabilityProbeResult> {
	const assertions: Record<string, boolean> = {};
	let sandbox: ProbeSession | undefined;
	let sandboxDestroyed = false;
	try {
		sandbox = await open();
		await sandbox.writeFile("/workspace/probe.txt", "probe");
		await sandbox.writeFile("/workspace/network-probe.mjs", NETWORK_FIXTURE);
		await sandbox.writeFile(
			"/workspace/privilege-probe.mjs",
			privilegeFixture(sandbox.expectedUid ?? ANALYST_UID),
		);
		const check = `${sandbox.checkWrapper ?? "/usr/local/bin/ocai-run-check"} /workspace/repositories/probe`;
		assertions.fileOperations = (await sandbox.readFile("/workspace/probe.txt")) === "probe";
		assertions.execution = (await sandbox.exec("test -r /workspace/probe.txt", 5)).exitCode === 0;
		const network = await sandbox.exec(`${check} bun /workspace/network-probe.mjs`, 20);
		assertions.noEgressNamespaceAvailable = network.exitCode === 0;
		assertions.noDns = !network.stdout.includes("dns:reachable");
		assertions.noPublicHttp =
			!network.stdout.includes("publicHttp:reachable") &&
			!network.stdout.includes("publicHttps:reachable");
		assertions.noPrivateDns = !network.stdout.includes("privateDns:reachable");
		assertions.noPrivateHttp = !network.stdout.includes("privateHttp:reachable");
		assertions.noMetadata = !network.stdout.includes("metadata:reachable");
		const privilege = await sandbox.exec(`${check} bun /workspace/privilege-probe.mjs`, 10);
		assertions.privilegeProbeCompleted = privilege.exitCode === 0;
		assertions.nonRoot = !privilege.stdout.includes("unexpected-user");
		assertions.cannotReconfigureNamespace = !privilege.stdout.includes("namespace-reconfigured");
		assertions.noControlPlaneSecrets = !privilege.stdout.includes("secret-visible");
		const timeout = await sandbox.exec(`${check} bun -e 'while (true) {}'`, 1);
		assertions.timeoutTermination = timeout.timedOut;
		Object.assign(assertions, (await sandbox.assertions?.()) ?? {});
	} finally {
		if (sandbox) {
			await sandbox.destroy();
			sandboxDestroyed = true;
		}
	}
	return {
		passed: Object.values(assertions).every(Boolean) && sandboxDestroyed,
		assertions,
		sandboxDestroyed,
	};
}
