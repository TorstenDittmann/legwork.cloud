import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Database } from "./client";
import { durableJobs } from "./schema";

export interface EnqueueJobOptions {
	singletonKey?: string;
	maxAttempts?: number;
	availableAt?: Date;
}

export async function enqueueJob(
	db: Database,
	name: string,
	data: Record<string, unknown>,
	options: EnqueueJobOptions = {},
): Promise<string> {
	const [created] = await db
		.insert(durableJobs)
		.values({
			name,
			data,
			singletonKey: options.singletonKey,
			maxAttempts: options.maxAttempts ?? 1,
			availableAt: options.availableAt ?? new Date(),
		})
		.onConflictDoNothing()
		.returning({ id: durableJobs.id });
	if (created) return created.id;
	if (!options.singletonKey) throw new Error("Failed to enqueue job");
	const [existing] = await db
		.select({ id: durableJobs.id })
		.from(durableJobs)
		.where(
			and(
				eq(durableJobs.name, name),
				eq(durableJobs.singletonKey, options.singletonKey),
				inArray(durableJobs.status, ["queued", "active"]),
			),
		)
		.limit(1);
	if (!existing) throw new Error("Failed to resolve singleton job");
	return existing.id;
}

export async function claimJobs(
	db: Database,
	name: string,
	limit: number,
	leaseOwner: string,
	leaseMs: number,
	now = new Date(),
) {
	return db.transaction(
		async (tx) => {
			const eligible = or(
				and(eq(durableJobs.status, "queued"), lte(durableJobs.availableAt, now)),
				and(eq(durableJobs.status, "active"), lte(durableJobs.leaseExpiresAt, now)),
			);
			const candidates = await tx
				.select()
				.from(durableJobs)
				.where(and(eq(durableJobs.name, name), eligible))
				.orderBy(asc(durableJobs.availableAt))
				.limit(limit);
			const claimed = [];
			for (const candidate of candidates) {
				const [job] = await tx
					.update(durableJobs)
					.set({
						status: "active",
						attempts: candidate.attempts + 1,
						leaseOwner,
						leaseExpiresAt: new Date(now.getTime() + leaseMs),
						updatedAt: now,
					})
					.where(and(eq(durableJobs.id, candidate.id), eligible))
					.returning();
				if (job) claimed.push(job);
			}
			return claimed;
		},
		{ behavior: "immediate" },
	);
}

/**
 * Extend the lease on a job this worker still owns. Returns false when the
 * lease has been taken over (or the job left the active state), which tells
 * the caller its in-flight work may now be running elsewhere.
 */
export async function renewJobLease(
	db: Database,
	id: string,
	leaseOwner: string,
	leaseMs: number,
): Promise<boolean> {
	const renewed = await db
		.update(durableJobs)
		.set({ leaseExpiresAt: new Date(Date.now() + leaseMs), updatedAt: new Date() })
		.where(
			and(
				eq(durableJobs.id, id),
				eq(durableJobs.leaseOwner, leaseOwner),
				eq(durableJobs.status, "active"),
			),
		)
		.returning({ id: durableJobs.id });
	return renewed.length > 0;
}

/** Returns false when the lease was lost, so callers can flag possible duplicate work. */
export async function completeJob(db: Database, id: string, leaseOwner: string): Promise<boolean> {
	const completed = await db
		.update(durableJobs)
		.set({ status: "completed", leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
		.where(
			and(
				eq(durableJobs.id, id),
				eq(durableJobs.leaseOwner, leaseOwner),
				eq(durableJobs.status, "active"),
			),
		)
		.returning({ id: durableJobs.id });
	return completed.length > 0;
}

export type FailJobOutcome = "retry" | "exhausted" | "lost";

/**
 * Record a job failure. "lost" means another worker took the lease over; the
 * job row is left untouched so the new owner's attempt proceeds undisturbed.
 */
export async function failJob(
	db: Database,
	id: string,
	leaseOwner: string,
	error: unknown,
	retryDelaySeconds: number,
): Promise<FailJobOutcome> {
	const [job] = await db
		.select()
		.from(durableJobs)
		.where(and(eq(durableJobs.id, id), eq(durableJobs.leaseOwner, leaseOwner)))
		.limit(1);
	if (!job) return "lost";
	const retry = job.attempts < job.maxAttempts;
	const failed = await db
		.update(durableJobs)
		.set({
			status: retry ? "queued" : "failed",
			availableAt: retry ? new Date(Date.now() + retryDelaySeconds * 1_000) : job.availableAt,
			leaseOwner: null,
			leaseExpiresAt: null,
			lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Job failed",
			updatedAt: new Date(),
		})
		.where(and(eq(durableJobs.id, id), eq(durableJobs.leaseOwner, leaseOwner)))
		.returning({ id: durableJobs.id });
	if (failed.length === 0) return "lost";
	return retry ? "retry" : "exhausted";
}

export async function deferJob(
	db: Database,
	id: string,
	leaseOwner: string,
	delaySeconds: number,
): Promise<void> {
	await db
		.update(durableJobs)
		.set({
			status: "queued",
			attempts: sql`max(${durableJobs.attempts} - 1, 0)`,
			availableAt: new Date(Date.now() + delaySeconds * 1_000),
			leaseOwner: null,
			leaseExpiresAt: null,
			updatedAt: new Date(),
		})
		.where(and(eq(durableJobs.id, id), eq(durableJobs.leaseOwner, leaseOwner)));
}

export async function purgeFinishedJobs(db: Database, before: Date): Promise<number> {
	const deleted = await db
		.delete(durableJobs)
		.where(
			and(inArray(durableJobs.status, ["completed", "failed"]), lte(durableJobs.updatedAt, before)),
		)
		.returning({ id: durableJobs.id });
	return deleted.length;
}
