import { and, eq, inArray } from "drizzle-orm";
import {
	analysisRuns,
	callbackDeliveries,
	claimJobs,
	completeJob,
	createDatabase,
	deferJob,
	enqueueJob,
	failJob,
	incidents,
	notificationDeliveries,
	reconcileUsage,
	services,
} from "@legwork/db";
import { logger } from "@legwork/observability";
import { buildAnalysisTemplate } from "@legwork/sandbox";
import { analyzeIncident, OrganizationConcurrencyDeferredError } from "./analysis";
import { CallbackRetryError, deliverCallback } from "./callbacks";
import { workerConfig } from "./config";
import { syncGitHubInstallation } from "./github-sync";
import { destroyOrphanedSandboxes, purgeExpired } from "./maintenance";
import {
	deliverNotification,
	enqueueNotifications,
	NotificationRetryError,
} from "./notifications";

const config = workerConfig();
const db = createDatabase();
const workerId = crypto.randomUUID();
let stopping = false;

await buildAnalysisTemplate();
logger.info("Railway sandbox template is ready");

async function enqueueAutomaticCallback(runId: string): Promise<void> {
	const [record] = await db
		.select({ run: analysisRuns, service: services })
		.from(analysisRuns)
		.innerJoin(incidents, eq(incidents.id, analysisRuns.incidentId))
		.innerJoin(services, eq(services.id, incidents.serviceId))
		.where(eq(analysisRuns.id, runId))
		.limit(1);
	if (
		!record?.service.callbackUrl ||
		!["completed", "inconclusive", "failed"].includes(record.run.status)
	)
		return;
	const [existing] = await db
		.select({ id: callbackDeliveries.id })
		.from(callbackDeliveries)
		.where(
			and(
				eq(callbackDeliveries.runId, runId),
				inArray(callbackDeliveries.status, ["pending", "retrying", "delivered"]),
			),
		)
		.limit(1);
	if (existing) return;
	const [delivery] = await db
		.insert(callbackDeliveries)
		.values({
			organizationId: record.run.organizationId,
			runId,
			event:
				record.run.status === "completed"
					? "analysis.completed"
					: record.run.status === "inconclusive"
						? "analysis.inconclusive"
						: "analysis.failed",
			expiresAt: record.run.expiresAt,
		})
		.returning({ id: callbackDeliveries.id });
	if (delivery)
		await enqueueJob(
			db,
			"deliver-callback",
			{ deliveryId: delivery.id },
			{ singletonKey: delivery.id, maxAttempts: 6 },
		);
}

interface PollOptions {
	concurrency: number;
	leaseMs: number;
	retryDelay(error: unknown, attempts: number): number;
	deferDelay?(error: unknown): number | null;
}
function pollQueue(
	name: string,
	options: PollOptions,
	handler: (data: Record<string, unknown>) => Promise<void>,
	onFailure?: (data: Record<string, unknown>, retry: boolean) => Promise<void>,
) {
	let polling = false;
	const poll = async () => {
		if (stopping || polling) return;
		polling = true;
		try {
			const jobs = await claimJobs(db, name, options.concurrency, workerId, options.leaseMs);
			await Promise.all(
				jobs.map(async (job) => {
					try {
						await handler(job.data);
						await completeJob(db, job.id, workerId);
					} catch (error) {
						const deferSeconds = options.deferDelay?.(error);
						if (deferSeconds) {
							await deferJob(db, job.id, workerId, deferSeconds);
							logger.info(
								{ queue: name, jobId: job.id, deferSeconds },
								"job deferred without consuming an attempt",
							);
							return;
						}
						const retry = await failJob(
							db,
							job.id,
							workerId,
							error,
							options.retryDelay(error, job.attempts),
						);
						logger.error(
							{ queue: name, jobId: job.id, attempt: job.attempts, retry, err: error },
							"job failed",
						);
						await onFailure?.(job.data, retry);
					}
				}),
			);
		} catch (error) {
			logger.error({ queue: name, err: error }, "queue poll failed");
		} finally {
			polling = false;
		}
	};
	const timer = setInterval(() => void poll(), 1_000);
	void poll();
	return timer;
}

const timers = [
	pollQueue(
		"analyze-incident",
		{
			concurrency: config.workerConcurrency,
			leaseMs: 12 * 60_000,
			retryDelay: (_error, attempt) => 30 * 2 ** Math.max(0, attempt - 1),
			deferDelay: (error) => (error instanceof OrganizationConcurrencyDeferredError ? 30 : null),
		},
		async (data) => {
			const runId = String(data.runId);
			await analyzeIncident(runId, config);
			await enqueueAutomaticCallback(runId);
			await enqueueNotifications(runId);
		},
		async (data, retry) => {
			const runId = String(data.runId);
			if (retry)
				await db
					.update(analysisRuns)
					.set({
						status: "queued",
						failureCode: null,
						failureMessage: null,
						completedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(analysisRuns.id, runId));
			else {
				const [run] = await db
					.select()
					.from(analysisRuns)
					.where(eq(analysisRuns.id, runId))
					.limit(1);
				if (run) {
					if (run.status !== "failed")
						await db
							.update(analysisRuns)
							.set({
								status: "failed",
								failureCode: "JOB_ATTEMPTS_EXHAUSTED",
								failureMessage: "Analysis could not complete after automatic retries",
								completedAt: new Date(),
								updatedAt: new Date(),
							})
							.where(eq(analysisRuns.id, runId));
					await reconcileUsage(db, run.organizationId, runId, 0, 0);
				}
				await enqueueAutomaticCallback(runId);
				await enqueueNotifications(runId);
			}
		},
	),
	pollQueue(
		"deliver-callback",
		{
			concurrency: 10,
			leaseMs: 60_000,
			retryDelay: (error) => (error instanceof CallbackRetryError ? error.delaySeconds : 60),
		},
		async (data) => {
			await deliverCallback(String(data.deliveryId), config.appUrl, config.encryptionKey);
		},
		async (data, retry) => {
			if (!retry)
				await db
					.update(callbackDeliveries)
					.set({ status: "permanently_failed", updatedAt: new Date() })
					.where(eq(callbackDeliveries.id, String(data.deliveryId)));
		},
	),
		pollQueue(
			"deliver-notification",
			{
				concurrency: 10,
				leaseMs: 60_000,
				retryDelay: (error) => (error instanceof NotificationRetryError ? error.delaySeconds : 60),
			},
			async (data) => {
				await deliverNotification(String(data.deliveryId), {
					appUrl: config.appUrl,
					encryptionKey: config.encryptionKey,
					resendApiKey: config.resendApiKey,
					resendFromAddress: config.resendFromAddress,
				});
			},
			async (data, retry) => {
				if (!retry)
					await db
						.update(notificationDeliveries)
						.set({ status: "permanently_failed", updatedAt: new Date() })
						.where(eq(notificationDeliveries.id, String(data.deliveryId)));
			},
		),
	pollQueue(
		"sync-github",
		{ concurrency: 2, leaseMs: 120_000, retryDelay: () => 60 },
		async (data) => {
			await syncGitHubInstallation(
				String(data.installationId),
				config.githubAppId,
				config.githubPrivateKey,
			);
		},
	),
	setInterval(() => void destroyOrphanedSandboxes(), 15 * 60_000),
	setInterval(() => void purgeExpired(), 24 * 60 * 60_000),
];
void destroyOrphanedSandboxes();
void purgeExpired();

const shutdown = () => {
	stopping = true;
	for (const timer of timers) clearInterval(timer);
	logger.info("worker stopped");
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
logger.info({ concurrency: config.workerConcurrency, workerId }, "SQLite-backed worker started");
