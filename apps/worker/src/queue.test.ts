import { beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { claimJobs, createDatabase, durableJobs, enqueueJob } from "@legwork/db";
import { createQueuePoller } from "./queue";

const db = createDatabase(`/tmp/legwork-queue-test-${process.pid}.db`);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL("../../../packages/db/migrations", import.meta.url).pathname,
	});
});

async function jobRow(id: string) {
	const [row] = await db.select().from(durableJobs).where(eq(durableJobs.id, id)).limit(1);
	if (!row) throw new Error("job row missing");
	return row;
}

describe("createQueuePoller", () => {
	it("keeps claiming new jobs while a long-running job is still in flight", async () => {
		let releaseBlocked = () => {};
		const blocked = new Promise<void>((resolve) => {
			releaseBlocked = resolve;
		});
		const handled: string[] = [];
		const poller = createQueuePoller({
			db,
			name: "refill",
			workerId: "worker-a",
			concurrency: 2,
			leaseMs: 60_000,
			retryDelay: () => 0,
			handler: async (data) => {
				handled.push(String(data.marker));
				if (data.marker === "slow") await blocked;
			},
		});
		await enqueueJob(
			db,
			"refill",
			{ marker: "slow" },
			{ availableAt: new Date(Date.now() - 3_000) },
		);
		await enqueueJob(
			db,
			"refill",
			{ marker: "one" },
			{ availableAt: new Date(Date.now() - 2_000) },
		);
		const third = await enqueueJob(
			db,
			"refill",
			{ marker: "two" },
			{ availableAt: new Date(Date.now() - 1_000) },
		);
		await poller.poll();
		expect(handled).toEqual(["slow", "one"]);
		await vi.waitFor(() => expect(poller.inflight()).toBe(1));
		await poller.poll();
		await vi.waitFor(() => expect(handled).toContain("two"));
		await vi.waitFor(() => expect(poller.inflight()).toBe(1));
		expect((await jobRow(third)).status).toBe("completed");
		releaseBlocked();
		await vi.waitFor(() => expect(poller.inflight()).toBe(0));
	});

	it("renews the lease while a handler outlives the initial lease window", async () => {
		// Lease timestamps round-trip through SQLite at second precision, so the
		// lease and sleeps here are sized in whole seconds.
		const poller = createQueuePoller({
			db,
			name: "heartbeat",
			workerId: "worker-a",
			concurrency: 1,
			leaseMs: 2_000,
			heartbeatMs: 300,
			retryDelay: () => 0,
			handler: async () => {
				await sleep(3_500);
			},
		});
		const id = await enqueueJob(db, "heartbeat", {});
		await poller.poll();
		await sleep(3_000);
		// Without renewal the 2s lease has long expired and another worker
		// would claim the same job mid-flight.
		expect(await claimJobs(db, "heartbeat", 1, "worker-b", 60_000)).toEqual([]);
		await vi.waitFor(() => expect(poller.inflight()).toBe(0), { timeout: 5_000 });
		expect((await jobRow(id)).status).toBe("completed");
	}, 10_000);

	it("drain waits for in-flight jobs to finish", async () => {
		const poller = createQueuePoller({
			db,
			name: "drain-finish",
			workerId: "worker-a",
			concurrency: 1,
			leaseMs: 60_000,
			retryDelay: () => 0,
			handler: async () => {
				await sleep(100);
			},
		});
		const id = await enqueueJob(db, "drain-finish", {});
		await poller.poll();
		expect(await poller.drain(2_000)).toBe(true);
		expect((await jobRow(id)).status).toBe("completed");
	});

	it("drain releases unfinished jobs for immediate reclaim without burning an attempt", async () => {
		const poller = createQueuePoller({
			db,
			name: "drain-release",
			workerId: "worker-a",
			concurrency: 1,
			leaseMs: 60_000,
			retryDelay: () => 0,
			handler: async () => {
				await new Promise(() => {});
			},
		});
		const id = await enqueueJob(db, "drain-release", {}, { maxAttempts: 2 });
		await poller.poll();
		expect((await jobRow(id)).attempts).toBe(1);
		expect(await poller.drain(50)).toBe(false);
		const released = await jobRow(id);
		expect(released.status).toBe("queued");
		expect(released.attempts).toBe(0);
		const [reclaimed] = await claimJobs(db, "drain-release", 1, "worker-b", 60_000);
		expect(reclaimed?.id).toBe(id);
	});

	it("skips the failure hook when the lease was already taken over", async () => {
		const failures: boolean[] = [];
		const poller = createQueuePoller({
			db,
			name: "lost-lease",
			workerId: "worker-a",
			concurrency: 1,
			leaseMs: 300,
			heartbeatMs: 10_000,
			retryDelay: () => 0,
			handler: async () => {
				await sleep(200);
				throw new Error("late failure");
			},
			onFailure: async (_data, retry) => {
				failures.push(retry);
			},
		});
		const id = await enqueueJob(db, "lost-lease", {}, { maxAttempts: 2 });
		await poller.poll();
		const takeover = new Date(Date.now() + 5_000);
		const [stolen] = await claimJobs(db, "lost-lease", 1, "worker-b", 60_000, takeover);
		expect(stolen?.id).toBe(id);
		await vi.waitFor(() => expect(poller.inflight()).toBe(0));
		// worker-a's late failure must not mark the job failed or fire
		// onFailure while worker-b legitimately runs it.
		expect(failures).toEqual([]);
		expect((await jobRow(id)).leaseOwner).toBe("worker-b");
	});
});
