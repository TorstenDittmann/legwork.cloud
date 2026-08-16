import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import {
	claimJobs,
	analysisRuns,
	LibSqlCheckpointSaver,
	closeDatabase,
	completeJob,
	createDatabase,
	createIncidentIdempotently,
	createRetryRun,
	deferJob,
	enqueueJob,
	failJob,
	organizations,
	services,
	tenantQueries,
	TenantNotFoundError,
} from "./index";

const databasePath = `/tmp/legwork-db-test-${process.pid}.db`;
const db = createDatabase(databasePath);
beforeAll(async () => {
	await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
});

describe("libSQL LangGraph checkpoints", () => {
	it("round-trips binary state and pending writes within the configured tenant run", async () => {
		const [organization] = await db
			.insert(organizations)
			.values({
				workosOrganizationId: "org_graph",
				name: "Graph",
				slug: "graph",
			})
			.returning();
		if (!organization) throw new Error("fixture setup failed");
		const [service] = await db
			.insert(services)
			.values({ organizationId: organization.id, name: "Graph API", slug: "graph-api" })
			.returning();
		if (!service) throw new Error("fixture setup failed");
		const created = await createIncidentIdempotently(db, {
			organizationId: organization.id,
			serviceId: service.id,
			idempotencyKey: "graph-checkpoint",
			payload: {
				externalId: "graph-checkpoint",
				title: "Checkpoint test",
				severity: "low",
				occurredAt: new Date().toISOString(),
			},
		});
		const saver = new LibSqlCheckpointSaver({
			db,
			organizationId: organization.id,
			runId: created.runId,
			expiresAt: new Date(Date.now() + 60_000),
		});
		const checkpoint = {
			...emptyCheckpoint(),
			id: "00000000-0000-6000-8000-000000000001",
			channel_values: { state: { bytes: new Uint8Array([1, 2, 3]) } },
		};
		const config = await saver.put(
			{ configurable: { thread_id: created.runId } },
			checkpoint,
			{ source: "input", step: -1, parents: {} },
			{},
		);
		await saver.putWrites(config, [["result", { ok: true }]], "task-1");
		const tuple = await saver.getTuple(config);
		expect(tuple?.checkpoint.channel_values).toEqual(checkpoint.channel_values);
		expect(tuple?.pendingWrites).toEqual([["task-1", "result", { ok: true }]]);
		await expect(saver.getTuple({ configurable: { thread_id: "another-run" } })).rejects.toThrow(
			"thread_id must equal",
		);
	});
});
afterAll(async () => {
	await closeDatabase();
	await rm(databasePath, { force: true });
});

describe("durable libSQL queue", () => {
	it("claims a singleton once and recovers a failed lease", async () => {
		const first = await enqueueJob(
			db,
			"analysis",
			{ runId: "run" },
			{ singletonKey: "run", maxAttempts: 2 },
		);
		expect(
			await enqueueJob(db, "analysis", { runId: "run" }, { singletonKey: "run", maxAttempts: 2 }),
		).toBe(first);
		const [claimed] = await claimJobs(db, "analysis", 1, "worker-a", 60_000);
		expect(claimed?.id).toBe(first);
		expect(await failJob(db, first, "worker-a", new Error("transient"), 0)).toBe(true);
		const [retried] = await claimJobs(
			db,
			"analysis",
			1,
			"worker-b",
			60_000,
			new Date(Date.now() + 1),
		);
		expect(retried?.attempts).toBe(2);
		await completeJob(db, first, "worker-b");
		expect(await claimJobs(db, "analysis", 1, "worker-c", 60_000)).toEqual([]);
	});
	it("defers capacity-bound work without consuming an attempt", async () => {
		const id = await enqueueJob(
			db,
			"capacity",
			{ runId: "waiting" },
			{ singletonKey: "waiting", maxAttempts: 2 },
		);
		const [claimed] = await claimJobs(db, "capacity", 1, "worker-a", 60_000);
		expect(claimed?.attempts).toBe(1);
		await deferJob(db, id, "worker-a", 0);
		const [reclaimed] = await claimJobs(
			db,
			"capacity",
			1,
			"worker-b",
			60_000,
			new Date(Date.now() + 1),
		);
		expect(reclaimed?.attempts).toBe(1);
		await completeJob(db, id, "worker-b");
	});
});

describe("tenant queries", () => {
	it("never resolves another organization's service", async () => {
		const [a, b] = await db
			.insert(organizations)
			.values([
				{ workosOrganizationId: "org_a", name: "A", slug: "a" },
				{ workosOrganizationId: "org_b", name: "B", slug: "b" },
			])
			.returning();
		if (!a || !b) throw new Error("fixture setup failed");
		await db.insert(services).values([
			{ organizationId: a.id, name: "A Service", slug: "api" },
			{ organizationId: b.id, name: "B Service", slug: "private" },
		]);
		expect((await tenantQueries(db, a.id).serviceBySlug("api")).name).toBe("A Service");
		await expect(tenantQueries(db, a.id).serviceBySlug("private")).rejects.toBeInstanceOf(
			TenantNotFoundError,
		);
	});
});

describe("incident reservation", () => {
	it("returns the original run for an idempotency duplicate", async () => {
		const [organization] = await db
			.insert(organizations)
			.values({
				workosOrganizationId: "org_idem",
				name: "Idem",
				slug: "idem",
			})
			.returning();
		if (!organization) throw new Error("fixture setup failed");
		const [service] = await db
			.insert(services)
			.values({ organizationId: organization.id, name: "API", slug: "idem-api" })
			.returning();
		if (!service) throw new Error("fixture setup failed");
		const payload = {
			externalId: "incident-1",
			title: "Failure",
			severity: "high" as const,
			occurredAt: new Date().toISOString(),
		};
		const first = await createIncidentIdempotently(db, {
			organizationId: organization.id,
			serviceId: service.id,
			idempotencyKey: "same",
			payload,
		});
		const duplicate = await createIncidentIdempotently(db, {
			organizationId: organization.id,
			serviceId: service.id,
			idempotencyKey: "same",
			payload,
		});
		expect(duplicate).toMatchObject({
			incidentId: first.incidentId,
			runId: first.runId,
			duplicate: true,
		});
	});

	it("allows a completed incident analysis to be run again", async () => {
		const [organization] = await db
			.insert(organizations)
			.values({
				workosOrganizationId: "org_rerun",
				name: "Rerun",
				slug: "rerun",
			})
			.returning();
		if (!organization) throw new Error("fixture setup failed");
		const [service] = await db
			.insert(services)
			.values({ organizationId: organization.id, name: "API", slug: "rerun-api" })
			.returning();
		if (!service) throw new Error("fixture setup failed");
		const created = await createIncidentIdempotently(db, {
			organizationId: organization.id,
			serviceId: service.id,
			idempotencyKey: "rerun",
			payload: {
				externalId: "incident-rerun",
				title: "Failure",
				severity: "high",
				occurredAt: new Date().toISOString(),
			},
		});
		await db
			.update(analysisRuns)
			.set({ status: "completed" })
			.where(eq(analysisRuns.id, created.runId));
		const retry = await createRetryRun(db, organization.id, created.incidentId, created.runId);
		const [retryRun] = await db
			.select()
			.from(analysisRuns)
			.where(eq(analysisRuns.id, retry.id))
			.limit(1);
		expect(retryRun).toMatchObject({ status: "queued", retryOfRunId: created.runId });
	});
});
