import { beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import {
	analysisRuns,
	createDatabase,
	createIncidentIdempotently,
	organizations,
	reconcileUsage,
	services,
} from "@legwork/db";
import { handleAnalysisFailure } from "./analysis-failure";

const db = createDatabase(`/tmp/legwork-analysis-failure-test-${process.pid}.db`);

let organizationId = "";
let serviceId = "";

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL("../../../packages/db/migrations", import.meta.url).pathname,
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: "org_failure", name: "Failure", slug: "failure" })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: "API", slug: "api" })
		.returning();
	organizationId = organization!.id;
	serviceId = service!.id;
});

async function seedRun(key: string): Promise<string> {
	const created = await createIncidentIdempotently(db, {
		organizationId,
		serviceId,
		idempotencyKey: key,
		payload: {
			externalId: key,
			title: "Incident",
			severity: "low",
			occurredAt: new Date().toISOString(),
		},
	});
	return created.runId;
}

async function runRow(runId: string) {
	const [row] = await db.select().from(analysisRuns).where(eq(analysisRuns.id, runId)).limit(1);
	if (!row) throw new Error("run row missing");
	return row;
}

describe("handleAnalysisFailure", () => {
	it("does not reset a completed run to queued when a post-analysis step will retry", async () => {
		const runId = await seedRun("post-step-retry");
		// SQLite timestamps round-trip at second precision.
		const completedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
		await db
			.update(analysisRuns)
			.set({ status: "completed", completedAt })
			.where(eq(analysisRuns.id, runId));
		await handleAnalysisFailure(db, runId, true);
		const run = await runRow(runId);
		expect(run.status).toBe("completed");
		expect(run.completedAt?.getTime()).toBe(completedAt.getTime());
	});

	it("resets a mid-flight run to queued for the next attempt", async () => {
		const runId = await seedRun("mid-flight-retry");
		await db
			.update(analysisRuns)
			.set({ status: "failed", failureCode: "ANALYSIS_FAILED", completedAt: new Date() })
			.where(eq(analysisRuns.id, runId));
		await handleAnalysisFailure(db, runId, true);
		const run = await runRow(runId);
		expect(run.status).toBe("queued");
		expect(run.failureCode).toBeNull();
		expect(run.completedAt).toBeNull();
	});

	it("marks a non-terminal run failed once attempts are exhausted", async () => {
		const runId = await seedRun("exhausted");
		await db.update(analysisRuns).set({ status: "provisioning" }).where(eq(analysisRuns.id, runId));
		await handleAnalysisFailure(db, runId, false);
		const run = await runRow(runId);
		expect(run.status).toBe("failed");
		expect(run.failureCode).toBe("JOB_ATTEMPTS_EXHAUSTED");
		expect(run.completedAt).not.toBeNull();
	});

	it("keeps a completed run's result and usage when attempts are exhausted", async () => {
		const runId = await seedRun("exhausted-after-completion");
		await db
			.update(analysisRuns)
			.set({ status: "completed", completedAt: new Date() })
			.where(eq(analysisRuns.id, runId));
		await reconcileUsage(db, organizationId, runId, 100, 50);
		await handleAnalysisFailure(db, runId, false);
		const run = await runRow(runId);
		expect(run.status).toBe("completed");
		expect(run.inputTokens).toBe(100);
		expect(run.outputTokens).toBe(50);
	});
});
