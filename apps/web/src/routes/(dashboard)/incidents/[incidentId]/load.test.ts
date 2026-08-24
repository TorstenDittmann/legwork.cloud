import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import {
	analysisRuns,
	auditEvents,
	callbackDeliveries,
	createDatabase,
	createIncidentIdempotently,
	diagnoses,
	diagnosisFeedback,
	incidents,
	organizations,
	services
} from '@legwork/db';
import { actions, load } from './+page.server';

const db = createDatabase(`/tmp/legwork-incident-detail-load-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_detail', role: 'member' }
} as never;

let incidentId = '';
let firstRunId = '';
let retryRunId = '';

const runAction = async (name: 'feedback' | 'resolution', values: Record<string, string>) => {
	const form = new FormData();
	for (const [key, value] of Object.entries(values)) form.set(key, value);
	const action = actions[name];
	if (!action) throw new Error(`Missing ${name} action`);
	return action({
		locals,
		params: { incidentId },
		request: new Request(`http://localhost/incidents/${incidentId}?/${name}`, {
			method: 'POST',
			body: form
		})
	} as never);
};

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
	await db.insert(diagnoses).values({
		organizationId: organization!.id,
		runId: retryRunId,
		diagnosis: {
			schemaVersion: '1',
			status: 'diagnosed',
			title: 'Connection exhaustion',
			summary: 'The pool ran out of connections.',
			rootCause: { statement: 'Connections were not released.', confidence: 0.93 },
			evidence: [],
			suggestedFix: null,
			checksRun: [],
			limitations: []
		},
		expiresAt: firstRun!.expiresAt
	});
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

	it('persists diagnosis feedback for the exact run and exposes it on reload', async () => {
		const result = await runAction('feedback', {
			runId: retryRunId,
			verdict: 'confirmed',
			note: 'Matched the connection leak seen in production.'
		});
		expect(result).toMatchObject({ feedback: { verdict: 'confirmed' } });

		const [saved] = await db
			.select()
			.from(diagnosisFeedback)
			.where(eq(diagnosisFeedback.runId, retryRunId));
		expect(saved).toMatchObject({
			verdict: 'confirmed',
			note: 'Matched the connection leak seen in production.',
			submittedBy: 'user_1'
		});
		const data = await call();
		expect(data.snapshot.feedback).toMatchObject({ verdict: 'confirmed' });
	});

	it('requires a correction when a diagnosis is marked incorrect', async () => {
		const result = await runAction('feedback', {
			runId: retryRunId,
			verdict: 'incorrect',
			note: ''
		});
		expect(result).toMatchObject({ status: 422 });
	});

	it('marks an incident resolved, supports reopening, and audits both transitions', async () => {
		await runAction('resolution', { state: 'resolved' });
		let [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
		expect(incident?.resolvedAt).toBeInstanceOf(Date);
		expect(incident?.resolvedBy).toBe('user_1');

		await runAction('resolution', { state: 'investigating' });
		[incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
		expect(incident?.resolvedAt).toBeNull();
		expect(incident?.resolvedBy).toBeNull();
		const audits = await db.select().from(auditEvents);
		expect(audits.map(({ action }) => action)).toEqual(
			expect.arrayContaining(['diagnosis.feedback_saved', 'incident.resolved', 'incident.reopened'])
		);
	});
});
