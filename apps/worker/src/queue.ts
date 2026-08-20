import {
	claimJobs,
	completeJob,
	deferJob,
	failJob,
	renewJobLease,
	type Database,
} from "@legwork/db";
import { logger } from "@legwork/observability";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface QueuePollerOptions {
	db: Database;
	name: string;
	workerId: string;
	concurrency: number;
	leaseMs: number;
	/** Lease renewal cadence while a handler runs; defaults to a third of the lease. */
	heartbeatMs?: number;
	retryDelay(error: unknown, attempts: number): number;
	deferDelay?(error: unknown): number | null;
	handler(data: Record<string, unknown>): Promise<void>;
	onFailure?(data: Record<string, unknown>, retry: boolean): Promise<void>;
}

export interface QueuePoller {
	/** Claim up to the remaining concurrency capacity and start handlers without awaiting them. */
	poll(): Promise<void>;
	inflight(): number;
	/**
	 * Stop claiming, wait up to graceMs for in-flight handlers, then release
	 * the leases of anything still running so another worker can claim it
	 * immediately instead of waiting out the lease. Returns true when
	 * everything finished within the grace window.
	 */
	drain(graceMs: number): Promise<boolean>;
}

interface ClaimedJob {
	id: string;
	attempts: number;
	data: Record<string, unknown>;
}

export function createQueuePoller(options: QueuePollerOptions): QueuePoller {
	const { db, name, workerId } = options;
	const running = new Map<string, Promise<void>>();
	const heartbeatMs = options.heartbeatMs ?? Math.max(1_000, Math.floor(options.leaseMs / 3));
	let stopping = false;
	let polling = false;

	const runJob = async (job: ClaimedJob) => {
		const heartbeat = setInterval(() => {
			renewJobLease(db, job.id, workerId, options.leaseMs)
				.then((held) => {
					if (!held)
						logger.warn(
							{ queue: name, jobId: job.id },
							"job lease lost mid-execution; another worker may be running it",
						);
				})
				.catch((error) =>
					logger.warn({ queue: name, jobId: job.id, err: error }, "lease renewal failed"),
				);
		}, heartbeatMs);
		try {
			await options.handler(job.data);
			const held = await completeJob(db, job.id, workerId);
			if (!held)
				logger.warn(
					{ queue: name, jobId: job.id },
					"job finished after its lease was taken over; work may have been duplicated",
				);
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
			const outcome = await failJob(
				db,
				job.id,
				workerId,
				error,
				options.retryDelay(error, job.attempts),
			);
			logger.error(
				{ queue: name, jobId: job.id, attempt: job.attempts, outcome, err: error },
				"job failed",
			);
			if (outcome !== "lost") await options.onFailure?.(job.data, outcome === "retry");
		} finally {
			clearInterval(heartbeat);
		}
	};

	const poll = async () => {
		if (stopping || polling) return;
		polling = true;
		try {
			const capacity = options.concurrency - running.size;
			if (capacity <= 0) return;
			const jobs = await claimJobs(db, name, capacity, workerId, options.leaseMs);
			for (const job of jobs) {
				const work = runJob(job)
					.catch((error) =>
						logger.error({ queue: name, jobId: job.id, err: error }, "job wrapper failed"),
					)
					.finally(() => running.delete(job.id));
				running.set(job.id, work);
			}
		} catch (error) {
			logger.error({ queue: name, err: error }, "queue poll failed");
		} finally {
			polling = false;
		}
	};

	const drain = async (graceMs: number) => {
		stopping = true;
		const settled = Promise.all([...running.values()]).then(() => true);
		const finished = await Promise.race([settled, sleep(graceMs).then(() => false)]);
		if (!finished)
			for (const jobId of [...running.keys()]) {
				await deferJob(db, jobId, workerId, 0).catch((error) =>
					logger.warn(
						{ queue: name, jobId, err: error },
						"failed to release a job lease during shutdown",
					),
				);
				logger.warn({ queue: name, jobId }, "released unfinished job lease during shutdown");
			}
		return finished;
	};

	return { poll, drain, inflight: () => running.size };
}
