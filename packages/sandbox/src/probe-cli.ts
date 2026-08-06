import { runCapabilityProbe } from "./probe";

const result = await runCapabilityProbe();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
