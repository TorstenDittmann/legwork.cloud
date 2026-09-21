import { resolveSandboxProviderKind, type SandboxProviderKind } from "@legwork/sandbox";

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

export function workerConfig() {
	process.env.LANGCHAIN_TRACING_V2 = "false";
	process.env.LANGSMITH_TRACING = "false";
	const sandboxProvider: SandboxProviderKind = resolveSandboxProviderKind();
	return {
		appUrl: required("APP_URL"),
		githubAppId: required("GITHUB_APP_ID"),
		githubPrivateKey: required("GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n"),
		openRouterApiKey: required("OPENROUTER_API_KEY"),
		encryptionKey: required("DATA_ENCRYPTION_KEY"),
		model: process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731",
		// Optional: Slack and Discord work without it; only email channels need Resend.
		resendApiKey: process.env.RESEND_API_KEY ?? "",
		resendFromAddress: process.env.RESEND_FROM_ADDRESS ?? "",
		workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? "5"),
		shutdownGraceMs: Number(process.env.SHUTDOWN_GRACE_MS ?? "25000"),
		sandboxProvider,
		commandExecutionEnabled: process.env.SANDBOX_COMMAND_EXECUTION === "true",
		capabilityProbePassed: process.env.SANDBOX_CAPABILITY_PROBE_PASSED === "true",
	};
}
