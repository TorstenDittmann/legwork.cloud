function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

export function workerConfig() {
	return {
		appUrl: required("APP_URL"),
		githubAppId: required("GITHUB_APP_ID"),
		githubPrivateKey: required("GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n"),
		openRouterApiKey: required("OPENROUTER_API_KEY"),
		encryptionKey: required("DATA_ENCRYPTION_KEY"),
		model: process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731",
		workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? "5"),
		commandExecutionEnabled: process.env.SANDBOX_COMMAND_EXECUTION === "true",
		capabilityProbePassed: process.env.SANDBOX_CAPABILITY_PROBE_PASSED === "true",
	};
}
