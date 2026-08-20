import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import {
	analysisRuns,
	callbackDeliveries,
	createDatabase,
	createIncidentIdempotently,
	organizations,
	services
} from '@legwork/db';
import { load } from './+page.server';

const db = createDatabase(`/tmp/legwork-incident-detail-load-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_detail', role: 'member' }
} as never;

let incidentId = '';
let firstRunId = '';
let retryRunId = '';

type LoadData = Exclude<Awaited<ReturnType<typeof load>>, void>;

const call = async (query = ''): Promise<LoadData> =>
	(await load({
		locals,
		params: { incidentId },
		url: new URL(`http://localhost/incidents/${incidentId}${query}`)
	} as never)) as LoadData;

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../../packages/db/migrations', import.meta.url)
			.pathname
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_detail', name: 'D', slug: 'd' })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: 'API', slug: 'api' })
		.returning();
	const created = await createIncidentIdempotently(db, {
		organizationId: organization!.id,
		serviceId: service!.id,
		idempotencyKey: 'detail',
		payload: {
			externalId: 'detail',
			title: 'Checkout latency spike',
			severity: 'high',
			occurredAt: new Date().toISOString()
		}
	});
	incidentId = created.incidentId;
	const [firstRun] = await db
		.select()
		.from(analysisRuns)
		.where(eq(analysisRuns.incidentId, incidentId))
		.limit(1);
	firstRunId = firstRun!.id;
	const [retryRun] = await db
		.insert(analysisRuns)
		.values({
			organizationId: organization!.id,
			incidentId,
			status: 'completed',
			retryOfRunId: firstRunId,
			expiresAt: firstRun!.expiresAt,
			createdAt: new Date(Date.now() + 10_000)
		})
		.returning();
	retryRunId = retryRun!.id;
	await db.insert(callbackDeliveries).values({
		organizationId: organization!.id,
		runId: retryRunId,
		event: 'analysis.completed',
		status: 'delivered',
		responseStatus: 200,
		expiresAt: firstRun!.expiresAt
	});
});

describe('incident detail load', () => {
	it('titles the page with the incident title', async () => {
		const data = await call();
		expect(data.title).toBe('Checkout latency spike');
	});

	it('exposes the full run history, newest first', async () => {
		const data = await call();
		expect(data.runs.map((run: { id: string }) => run.id)).toEqual([retryRunId, firstRunId]);
	});

	it('exposes callback deliveries for the current run', async () => {
		const data = await call();
		expect(data.callbacks).toHaveLength(1);
		expect(data.callbacks[0]).toMatchObject({ event: 'analysis.completed', status: 'delivered' });
	});

	it('loads a historical run statically via ?run=', async () => {
		const data = await call(`?run=${firstRunId}`);
		expect(data.selectedRun?.run.id).toBe(firstRunId);
		const current = await call(`?run=${retryRunId}`);
		expect(current.selectedRun).toBeNull();
	});
});
