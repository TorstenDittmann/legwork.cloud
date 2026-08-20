import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import {
	claimJobs,
	completeJob,
	createDatabase,
	durableJobs,
	enqueueJob,
	failJob,
	renewJobLease,
} from "./index";

const db = createDatabase(`/tmp/legwork-jobs-test-${process.pid}.db`);

beforeAll(async () => {
	await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
});

async function jobRow(id: string) {
	const [row] = await db.select().from(durableJobs).where(eq(durableJobs.id, id)).limit(1);
	if (!row) throw new Error("job row missing");
	return row;
}

describe("durable job leases", () => {
	it("renews an owned active lease so long handlers outlive the initial lease", async () => {
		const id = await enqueueJob(db, "lease-renew", {}, { maxAttempts: 3 });
		const [claimed] = await claimJobs(db, "lease-renew", 1, "worker-a", 1_000);
		expect(claimed?.id).toBe(id);
		const before = (await jobRow(id)).leaseExpiresAt;
		expect(await renewJobLease(db, id, "worker-a", 60_000)).toBe(true);
		const after = (await jobRow(id)).leaseExpiresAt;
		expect(after && before && after.getTime() > before.getTime()).toBe(true);
	});

	it("refuses to renew a lease another worker has taken over", async () => {
		const id = await enqueueJob(db, "lease-stolen", {}, { maxAttempts: 3 });
		const [claimed] = await claimJobs(db, "lease-stolen", 1, "worker-a", 1_000);
		expect(claimed?.id).toBe(id);
		const afterExpiry = new Date(Date.now() + 5_000);
		const [reclaimed] = await claimJobs(db, "lease-stolen", 1, "worker-b", 60_000, afterExpiry);
		expect(reclaimed?.id).toBe(id);
		expect(await renewJobLease(db, id, "worker-a", 60_000)).toBe(false);
		expect((await jobRow(id)).leaseOwner).toBe("worker-b");
	});

	it("reports whether completion still held the lease", async () => {
		const id = await enqueueJob(db, "lease-complete", {}, { maxAttempts: 3 });
		await claimJobs(db, "lease-complete", 1, "worker-a", 1_000);
		const afterExpiry = new Date(Date.now() + 5_000);
		await claimJobs(db, "lease-complete", 1, "worker-b", 60_000, afterExpiry);
		expect(await completeJob(db, id, "worker-a")).toBe(false);
		const stolen = await jobRow(id);
		expect(stolen.status).toBe("active");
		expect(stolen.leaseOwner).toBe("worker-b");
		expect(await completeJob(db, id, "worker-b")).toBe(true);
		expect((await jobRow(id)).status).toBe("completed");
	});

	it("distinguishes retry, exhaustion, and a lost lease on failure", async () => {
		const id = await enqueueJob(db, "lease-fail", {}, { maxAttempts: 2 });
		await claimJobs(db, "lease-fail", 1, "worker-a", 60_000);
		expect(await failJob(db, id, "worker-a", new Error("transient"), 0)).toBe("retry");
		await claimJobs(db, "lease-fail", 1, "worker-a", 1_000);
		const afterExpiry = new Date(Date.now() + 5_000);
		await claimJobs(db, "lease-fail", 1, "worker-b", 60_000, afterExpiry);
		expect(await failJob(db, id, "worker-a", new Error("late"), 0)).toBe("lost");
		expect((await jobRow(id)).leaseOwner).toBe("worker-b");
		expect(await failJob(db, id, "worker-b", new Error("fatal"), 0)).toBe("exhausted");
		expect((await jobRow(id)).status).toBe("failed");
	});
});
