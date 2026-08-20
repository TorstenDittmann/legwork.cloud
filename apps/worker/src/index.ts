import { eq } from "drizzle-orm";
import { callbackDeliveries, createDatabase, notificationDeliveries } from "@legwork/db";
import { logger } from "@legwork/observability";
import { buildAnalysisTemplate } from "@legwork/sandbox";
import { analyzeIncident, OrganizationConcurrencyDeferredError } from "./analysis";
import { handleAnalysisFailure } from "./analysis-failure";
import { CallbackRetryError, deliverCallback, enqueueAutomaticCallback } from "./callbacks";
import { workerConfig } from "./config";
import { syncGitHubInstallation } from "./github-sync";
import { destroyOrphanedSandboxes, purgeExpired } from "./maintenance";
import { deliverNotification, enqueueNotifications, NotificationRetryError } from "./notifications";
import { createQueuePoller } from "./queue";

const config = workerConfig();
const db = createDatabase();
const workerId = crypto.randomUUID();

await buildAnalysisTemplate();
logger.info("Railway sandbox template is ready");

const pollers = [
	createQueuePoller({
		db,
		name: "analyze-incident",
		workerId,
		concurrency: config.workerConcurrency,
		leaseMs: 12 * 60_000,
		retryDelay: (_error, attempt) => 30 * 2 ** Math.max(0, attempt - 1),
		deferDelay: (error) => (error instanceof OrganizationConcurrencyDeferredError ? 30 : null),
		handler: async (data) => {
			const runId = String(data.runId);
			await analyzeIncident(runId, config);
			await enqueueAutomaticCallback(db, runId);
			await enqueueNotifications(runId);
		},
		onFailure: (data, retry) => handleAnalysisFailure(db, String(data.runId), retry),
	}),
	createQueuePoller({
		db,
		name: "deliver-callback",
		workerId,
		concurrency: 10,
		leaseMs: 60_000,
		retryDelay: (error) => (error instanceof CallbackRetryError ? error.delaySeconds : 60),
		handler: async (data) => {
			await deliverCallback(String(data.deliveryId), config.appUrl, config.encryptionKey);
		},
		onFailure: async (data, retry) => {
			if (!retry)
				await db
					.update(callbackDeliveries)
					.set({ status: "permanently_failed", updatedAt: new Date() })
					.where(eq(callbackDeliveries.id, String(data.deliveryId)));
		},
	}),
	createQueuePoller({
		db,
		name: "deliver-notification",
		workerId,
		concurrency: 10,
		leaseMs: 60_000,
		retryDelay: (error) => (error instanceof NotificationRetryError ? error.delaySeconds : 60),
		handler: async (data) => {
			await deliverNotification(String(data.deliveryId), {
				appUrl: config.appUrl,
				encryptionKey: config.encryptionKey,
				resendApiKey: config.resendApiKey,
				resendFromAddress: config.resendFromAddress,
			});
		},
		onFailure: async (data, retry) => {
			if (!retry)
				await db
					.update(notificationDeliveries)
					.set({ status: "permanently_failed", updatedAt: new Date() })
					.where(eq(notificationDeliveries.id, String(data.deliveryId)));
		},
	}),
	createQueuePoller({
		db,
		name: "sync-github",
		workerId,
		concurrency: 2,
		leaseMs: 120_000,
		retryDelay: () => 60,
		handler: async (data) => {
			await syncGitHubInstallation(
				String(data.installationId),
				config.githubAppId,
				config.githubPrivateKey,
			);
		},
	}),
];

const timers = [
	...pollers.map((poller) => setInterval(() => void poller.poll(), 1_000)),
	setInterval(() => void destroyOrphanedSandboxes(), 15 * 60_000),
	setInterval(() => void purgeExpired(), 24 * 60 * 60_000),
];
void destroyOrphanedSandboxes();
void purgeExpired();
for (const poller of pollers) void poller.poll();

let shuttingDown = false;
const shutdown = async (signal: string) => {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const timer of timers) clearInterval(timer);
	logger.info({ signal, graceMs: config.shutdownGraceMs }, "worker draining");
	// Wait for in-flight jobs; whatever cannot finish inside the grace window
	// has its lease released so the next deploy claims it immediately instead
	// of waiting out the full lease.
	const drained = await Promise.all(pollers.map((poller) => poller.drain(config.shutdownGraceMs)));
	logger.info({ fullyDrained: drained.every(Boolean) }, "worker stopped");
	process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
logger.info({ concurrency: config.workerConcurrency, workerId }, "SQLite-backed worker started");
