import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import type { Diagnosis } from '@legwork/contracts';
import {
	agentSteps,
	analysisRuns,
	createDatabase,
	createIncidentIdempotently,
	diagnoses,
	organizations,
	services
} from '@legwork/db';
import { loadIncident, loadIncidentRun, loadIncidentStream } from './incidents';

const db = createDatabase(`/tmp/legwork-incidents-test-${process.pid}.db`);

let organizationId = '';
let incidentId = '';
let firstRunId = '';
let retryRunId = '';

const diagnosis: Diagnosis = {
	schemaVersion: '1',
	status: 'diagnosed',
	title: 'Null access',
	summary: 'A nullable value is used.',
	rootCause: { statement: 'Missing guard', confidence: 0.9 },
	evidence: [],
	suggestedFix: null,
	checksRun: [],
	limitations: []
};

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../packages/db/migrations', import.meta.url).pathname
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_incidents', name: 'I', slug: 'i' })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: 'API', slug: 'api' })
		.returning();
	organizationId = organization!.id;
	const created = await createIncidentIdempotently(db, {
		organizationId,
		serviceId: service!.id,
		idempotencyKey: 'stream',
		payload: {
			externalId: 'stream',
			title: 'Incident',
			severity: 'low',
			occurredAt: new Date().toISOString()
		}
	});
	incidentId = created.incidentId;
	const [firstRun] = await db
		.select()
		.from(analysisRuns)
		.where(eq(analysisRuns.incidentId, incidentId))
		.limit(1);
	// A second, newer run makes "current run" selection meaningful. SQLite
	// timestamps have second precision, so push it a clear 10s ahead.
	const [retryRun] = await db
		.insert(analysisRuns)
		.values({
			organizationId,
			incidentId,
			status: 'completed',
			expiresAt: firstRun!.expiresAt,
			createdAt: new Date(Date.now() + 10_000)
		})
		.returning();
	await db.insert(agentSteps).values({
		organizationId,
		runId: retryRun!.id,
		sequence: 1,
		kind: 'node_started',
		summary: 'load_context started',
		expiresAt: firstRun!.expiresAt
	});
	await db.insert(diagnoses).values({
		organizationId,
		runId: retryRun!.id,
		diagnosis,
		expiresAt: firstRun!.expiresAt
	});
	firstRunId = firstRun!.id;
	retryRunId = retryRun!.id;
});

describe('loadIncidentStream', () => {
	it('returns exactly the stream-consumed fields with parity to loadIncident', async () => {
		const full = await loadIncident(organizationId, incidentId);
		const stream = await loadIncidentStream(organizationId, incidentId);
		expect(full).not.toBeNull();
		expect(stream).toEqual({
			incident: full!.incident,
			serviceName: full!.serviceName,
			currentRun: full!.currentRun,
			steps: full!.steps,
			diagnosis: full!.diagnosis
		});
		expect(stream?.currentRun?.status).toBe('completed');
		expect(stream?.steps).toHaveLength(1);
	});

	it('stays tenant-scoped', async () => {
		const [foreign] = await db
			.insert(organizations)
			.values({ workosOrganizationId: 'org_foreign', name: 'F', slug: 'f' })
			.returning();
		expect(await loadIncidentStream(foreign!.id, incidentId)).toBeNull();
	});
});

describe('loadIncidentRun', () => {
	it('returns a historical run with its own steps and diagnosis', async () => {
		const historical = await loadIncidentRun(organizationId, incidentId, firstRunId);
		expect(historical?.run.id).toBe(firstRunId);
		expect(historical?.steps).toEqual([]);
		expect(historical?.diagnosis).toBeNull();
		const current = await loadIncidentRun(organizationId, incidentId, retryRunId);
		expect(current?.steps).toHaveLength(1);
		expect(current?.diagnosis).toEqual(diagnosis);
	});

	it('stays scoped to the incident and tenant', async () => {
		expect(await loadIncidentRun(organizationId, 'not-this-incident', firstRunId)).toBeNull();
	});
});
