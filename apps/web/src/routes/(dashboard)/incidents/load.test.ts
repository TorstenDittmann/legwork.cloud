import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { analysisRuns, createDatabase, incidents, organizations, services } from '@legwork/db';
import { load } from './+page.server';

const db = createDatabase(`/tmp/legwork-incidents-load-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_ledger', role: 'member' }
} as never;

type LoadData = Exclude<Awaited<ReturnType<typeof load>>, void>;

const call = async (query: string): Promise<LoadData> =>
	(await load({ locals, url: new URL(`http://localhost/incidents${query}`) } as never)) as LoadData;

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../packages/db/migrations', import.meta.url).pathname
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_ledger', name: 'L', slug: 'l' })
		.returning();
	const [service] = await db
		.insert(services)
		.values({ organizationId: organization!.id, name: 'API', slug: 'api' })
		.returning();
	const base = Date.now();
	const expiresAt = new Date(base + 30 * 24 * 60 * 60_000);
	// 101 incidents, newest first by occurredAt; the OLDEST one is the special
	// case: it has a failed run and a searchable title, so it sits beyond any
	// first-100 window.
	const rows = Array.from({ length: 101 }, (_, index) => ({
		organizationId: organization!.id,
		serviceId: service!.id,
		externalId: `ext-${index}`,
		idempotencyKey: `key-${index}`,
		title: index === 100 ? 'needle in the haystack' : `Incident ${index}`,
		severity: 'low' as const,
		occurredAt: new Date(base - index * 60_000),
		payload: {
			externalId: `ext-${index}`,
			title: `Incident ${index}`,
			severity: 'low',
			occurredAt: new Date(base - index * 60_000).toISOString()
		} as never,
		expiresAt
	}));
	const inserted = await db.insert(incidents).values(rows).returning({
		id: incidents.id,
		title: incidents.title
	});
	const oldest = inserted.find(({ title }) => title === 'needle in the haystack');
	await db.insert(analysisRuns).values({
		organizationId: organization!.id,
		incidentId: oldest!.id,
		status: 'failed',
		expiresAt
	});
});

describe('incident ledger load', () => {
	it('applies the status filter in SQL, not after the page cap', async () => {
		const result = await call('?status=failed');
		expect(result.displayed).toHaveLength(1);
		expect(result.displayed[0]?.incident.title).toBe('needle in the haystack');
	});

	it('pages results and reports the total', async () => {
		const first = await call('');
		expect(first.displayed).toHaveLength(50);
		expect(first.total).toBe(101);
		expect(first.pageCount).toBe(3);
		const last = await call('?page=3');
		expect(last.displayed).toHaveLength(1);
		expect(last.page).toBe(3);
	});

	it('searches incident titles beyond the first page window', async () => {
		const result = await call('?q=needle');
		expect(result.displayed).toHaveLength(1);
		expect(result.displayed[0]?.incident.title).toBe('needle in the haystack');
	});

	it('ignores unparseable date filters instead of comparing NaN', async () => {
		const result = await call('?from=garbage');
		expect(result.displayed).toHaveLength(50);
	});
});
