import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
	createDatabase,
	createIncidentIdempotently,
	durableJobs,
	langgraphCheckpoints,
	langgraphCheckpointWrites,
	organizations,
	serviceRateLimits,
	services,
} from "@legwork/db";
import { purgeExpired } from "./maintenance";

const db = createDatabase(`/tmp/legwork-maintenance-test-${process.pid}.db`);

let organizationId = "";
let serviceId = "";
let runId = "";

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL("../../../packages/db/migrations", import.meta.url).pathname,
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: "org_maintenance", name: "M", slug: "m" })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: "API", slug: "api" })
		.returning();
	organizationId = organization!.id;
	serviceId = service!.id;
	const created = await createIncidentIdempotently(db, {
		organizationId,
		serviceId,
		idempotencyKey: "maintenance",
		payload: {
			externalId: "maintenance",
			title: "Incident",
			severity: "low",
			occurredAt: new Date().toISOString(),
		},
	});
	runId = created.runId;
});

describe("purgeExpired", () => {
	it("purges expired LangGraph checkpoints and pending writes", async () => {
		const now = new Date();
		const expired = new Date(now.getTime() - 60 * 60_000);
		const fresh = new Date(now.getTime() + 60 * 60_000);
		const base = {
			organizationId,
			runId,
			checkpointNamespace: "",
			type: "msgpack",
			checkpoint: Buffer.from([1]),
			metadata: Buffer.from([2]),
		};
		await db.insert(langgraphCheckpoints).values([
			{ ...base, threadId: runId, checkpointId: "expired", expiresAt: expired },
			{ ...base, threadId: runId, checkpointId: "fresh", expiresAt: fresh },
		]);
		await db.insert(langgraphCheckpointWrites).values([
			{
				organizationId,
				runId,
				threadId: runId,
				checkpointNamespace: "",
				checkpointId: "expired",
				taskId: "task",
				writeIndex: 0,
				channel: "state",
				type: "msgpack",
				value: Buffer.from([3]),
				expiresAt: expired,
			},
		]);
		await purgeExpired(now);
		const checkpoints = await db.select().from(langgraphCheckpoints);
		expect(checkpoints.map(({ checkpointId }) => checkpointId)).toEqual(["fresh"]);
		expect(await db.select().from(langgraphCheckpointWrites)).toEqual([]);
	});

	it("purges finished durable jobs older than the retention window", async () => {
		const now = new Date();
		const old = new Date(now.getTime() - 8 * 24 * 60 * 60_000);
		const recent = new Date(now.getTime() - 60_000);
		await db.insert(durableJobs).values([
			{ name: "done-old", data: {}, status: "completed", availableAt: old, updatedAt: old },
			{ name: "failed-old", data: {}, status: "failed", availableAt: old, updatedAt: old },
			{
				name: "done-recent",
				data: {},
				status: "completed",
				availableAt: recent,
				updatedAt: recent,
			},
			{ name: "queued-old", data: {}, status: "queued", availableAt: old, updatedAt: old },
		]);
		await purgeExpired(now);
		const names = (await db.select({ name: durableJobs.name }).from(durableJobs))
			.map(({ name }) => name)
			.filter((name) => ["done-old", "failed-old", "done-recent", "queued-old"].includes(name));
		expect(names.sort()).toEqual(["done-recent", "queued-old"]);
	});

	it("purges rate-limit windows older than a day", async () => {
		const now = new Date();
		await db.insert(serviceRateLimits).values([
			{
				organizationId,
				serviceId,
				windowStartedAt: new Date(now.getTime() - 2 * 24 * 60 * 60_000),
			},
			{ organizationId, serviceId, windowStartedAt: new Date(now.getTime() - 10 * 60_000) },
		]);
		await purgeExpired(now);
		const windows = await db.select().from(serviceRateLimits);
		expect(windows).toHaveLength(1);
		expect(windows[0]!.windowStartedAt.getTime()).toBeGreaterThan(now.getTime() - 24 * 60 * 60_000);
	});
});
