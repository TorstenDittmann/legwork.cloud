import { createSbxAnalysisTemplate, sbxSandboxConfig } from "./sbx-provider";

// Run once per change to the sandbox scripts, with an admin key: the worker's sandbox key
// cannot build images.
const name = await createSbxAnalysisTemplate(sbxSandboxConfig());
process.stdout.write(`${name}\n`);
