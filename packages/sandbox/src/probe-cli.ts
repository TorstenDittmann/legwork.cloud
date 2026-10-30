import { openProbeSession, prepareSandboxRuntime } from "./factory";
import { runCapabilityProbe } from "./probe";

await prepareSandboxRuntime();
const result = await runCapabilityProbe(() => openProbeSession());
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
