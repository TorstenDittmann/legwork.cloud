import { createDatabase, enqueueJob } from '@legwork/db';

export async function enqueueAnalysis(runId: string): Promise<void> {
	await enqueueJob(
		createDatabase(),
		'analyze-incident',
		{ runId },
		{ singletonKey: runId, maxAttempts: 3 }
	);
}
export async function enqueueGitHubSync(installationId: string): Promise<void> {
	await enqueueJob(
		createDatabase(),
		'sync-github',
		{ installationId },
		{ singletonKey: installationId, maxAttempts: 3 }
	);
}
export async function enqueueCallback(deliveryId: string): Promise<void> {
	await enqueueJob(
		createDatabase(),
		'deliver-callback',
		{ deliveryId },
		{ singletonKey: deliveryId, maxAttempts: 6 }
	);
}
