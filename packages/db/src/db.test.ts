import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { rm } from "node:fs/promises";
import { claimJobs, closeDatabase, completeJob, createDatabase, createIncidentIdempotently, deferJob, enqueueJob, failJob, organizations, services, tenantQueries, TenantNotFoundError } from "./index";

const databasePath = `/tmp/oncall-ai-db-test-${process.pid}.db`;
const db = createDatabase(`file:${databasePath}`);
beforeAll(async () => { await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname }); });
afterAll(async () => { await closeDatabase(); await rm(databasePath, { force: true }); });

describe("durable Turso queue", () => {
  it("claims a singleton once and recovers a failed lease", async () => {
    const first = await enqueueJob(db, "analysis", { runId: "run" }, { singletonKey: "run", maxAttempts: 2 });
    expect(await enqueueJob(db, "analysis", { runId: "run" }, { singletonKey: "run", maxAttempts: 2 })).toBe(first);
    const [claimed] = await claimJobs(db, "analysis", 1, "worker-a", 60_000);
    expect(claimed?.id).toBe(first);
    expect(await failJob(db, first, "worker-a", new Error("transient"), 0)).toBe(true);
    const [retried] = await claimJobs(db, "analysis", 1, "worker-b", 60_000, new Date(Date.now() + 1));
    expect(retried?.attempts).toBe(2);
    await completeJob(db, first, "worker-b");
    expect(await claimJobs(db, "analysis", 1, "worker-c", 60_000)).toEqual([]);
  });
  it("defers capacity-bound work without consuming an attempt", async () => {
    const id = await enqueueJob(db, "capacity", { runId: "waiting" }, { singletonKey: "waiting", maxAttempts: 2 });
    const [claimed] = await claimJobs(db, "capacity", 1, "worker-a", 60_000);
    expect(claimed?.attempts).toBe(1);
    await deferJob(db, id, "worker-a", 0);
    const [reclaimed] = await claimJobs(db, "capacity", 1, "worker-b", 60_000, new Date(Date.now() + 1));
    expect(reclaimed?.attempts).toBe(1);
    await completeJob(db, id, "worker-b");
  });
});

describe("tenant queries", () => {
  it("never resolves another organization's service", async () => {
    const [a, b] = await db.insert(organizations).values([
      { workosOrganizationId: "org_a", name: "A", slug: "a" }, { workosOrganizationId: "org_b", name: "B", slug: "b" },
    ]).returning();
    if (!a || !b) throw new Error("fixture setup failed");
    await db.insert(services).values([{ organizationId: a.id, name: "A Service", slug: "api" }, { organizationId: b.id, name: "B Service", slug: "private" }]);
    expect((await tenantQueries(db, a.id).serviceBySlug("api")).name).toBe("A Service");
    await expect(tenantQueries(db, a.id).serviceBySlug("private")).rejects.toBeInstanceOf(TenantNotFoundError);
  });
});

describe("incident reservation", () => {
  it("returns the original run for an idempotency duplicate", async () => {
    const [organization] = await db.insert(organizations).values({ workosOrganizationId: "org_idem", name: "Idem", slug: "idem", betaAllowlisted: true }).returning();
    if (!organization) throw new Error("fixture setup failed");
    const [service] = await db.insert(services).values({ organizationId: organization.id, name: "API", slug: "idem-api" }).returning();
    if (!service) throw new Error("fixture setup failed");
    const payload = { externalId: "incident-1", title: "Failure", severity: "high" as const, occurredAt: new Date().toISOString() };
    const first = await createIncidentIdempotently(db, { organizationId: organization.id, serviceId: service.id, idempotencyKey: "same", payload });
    const duplicate = await createIncidentIdempotently(db, { organizationId: organization.id, serviceId: service.id, idempotencyKey: "same", payload });
    expect(duplicate).toMatchObject({ incidentId: first.incidentId, runId: first.runId, duplicate: true });
  });
});
