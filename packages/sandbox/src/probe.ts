import { Sandbox } from "railway";
import { analysisTemplate } from "./template";

export interface CapabilityProbeResult { passed: boolean; assertions: Record<string, boolean>; sandboxDestroyed: boolean }

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

export async function runCapabilityProbe(): Promise<CapabilityProbeResult> {
  const assertions: Record<string, boolean> = {};
  let sandbox: Sandbox | undefined;
  let sandboxDestroyed = false;
  try {
    sandbox = await Sandbox.create(analysisTemplate(), { idleTimeoutMinutes: 10, networkIsolation: "ISOLATED", env: {} });
    await sandbox.files.write("/workspace/probe.txt", "probe");
    await sandbox.files.write("/workspace/network-probe.mjs", NETWORK_FIXTURE);
    await sandbox.files.write("/workspace/privilege-probe.mjs", PRIVILEGE_FIXTURE);
    assertions.fileOperations = (await sandbox.files.read("/workspace/probe.txt")) === "probe";
    assertions.execution = (await sandbox.exec("test -r /workspace/probe.txt", { timeoutSec: 5 })).exitCode === 0;
    const network = await sandbox.exec("/usr/local/bin/ocai-run-check /workspace/repositories/probe node /workspace/network-probe.mjs", { timeoutSec: 20 });
    assertions.noEgressNamespaceAvailable = network.exitCode === 0;
    assertions.noDns = !network.stdout.includes("dns:reachable");
    assertions.noPublicHttp = !network.stdout.includes("publicHttp:reachable") && !network.stdout.includes("publicHttps:reachable");
    assertions.noPrivateDns = !network.stdout.includes("privateDns:reachable");
    assertions.noMetadata = !network.stdout.includes("metadata:reachable");
    const privilege = await sandbox.exec("/usr/local/bin/ocai-run-check /workspace/repositories/probe node /workspace/privilege-probe.mjs", { timeoutSec: 10 });
    assertions.privilegeProbeCompleted = privilege.exitCode === 0;
    assertions.nonRoot = !privilege.stdout.includes("unexpected-user");
    assertions.cannotReconfigureNamespace = !privilege.stdout.includes("namespace-reconfigured");
    assertions.noControlPlaneSecrets = !privilege.stdout.includes("secret-visible");
    const timeout = await sandbox.exec("/usr/local/bin/ocai-run-check /workspace/repositories/probe node -e 'while (true) {}'", { timeoutSec: 1 });
    assertions.timeoutTermination = timeout.timedOut;
  } finally {
    if (sandbox) { await sandbox.destroy(); sandboxDestroyed = true; }
  }
  return { passed: Object.values(assertions).every(Boolean) && sandboxDestroyed, assertions, sandboxDestroyed };
}
