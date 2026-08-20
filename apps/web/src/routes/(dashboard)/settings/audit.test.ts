import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { auditEvents, createDatabase, organizations } from '@legwork/db';
import { load } from './+page.server';

const db = createDatabase(`/tmp/legwork-settings-audit-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_audit', role: 'member' }
} as never;

type LoadData = Exclude<Awaited<ReturnType<typeof load>>, void>;

const call = async (query = ''): Promise<LoadData> =>
	(await load({ locals, url: new URL(`http://localhost/settings${query}`) } as never)) as LoadData;

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../packages/db/migrations', import.meta.url).pathname
	});
	const [organization] = await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_audit', name: 'A', slug: 'a' })
		.returning();
	const base = Date.now();
	await db.insert(auditEvents).values([
		// One event from a prior month must stay reachable; the old load
		// discarded everything before the 1st of the current month.
		{
			organizationId: organization!.id,
			actorId: 'user_ancient',
			action: 'service.updated',
			targetType: 'service',
			targetId: 'svc-old',
			metadata: { enabled: false },
			createdAt: new Date(base - 60 * 24 * 60 * 60_000)
		},
		...Array.from({ length: 54 }, (_, index) => ({
			organizationId: organization!.id,
			actorId: `user_${index}`,
			action: 'member.invited',
			targetType: 'member',
			targetId: `member-${index}`,
			metadata: { email: `person${index}@example.com` },
			createdAt: new Date(base - index * 2_000)
		}))
	]);
});

describe('settings audit load', () => {
	it('answers who did what to which target', async () => {
		const data = await call();
		const [first] = data.audits.rows;
		expect(first).toMatchObject({
			action: 'member.invited',
			actorId: 'user_0',
			targetType: 'member',
			targetId: 'member-0',
			metadata: { email: 'person0@example.com' }
		});
	});

	it('paginates the full history instead of capping the current month at 50', async () => {
		const first = await call();
		expect(first.audits.total).toBe(55);
		expect(first.audits.rows).toHaveLength(50);
		expect(first.audits.pageCount).toBe(2);
		const second = await call('?auditPage=2');
		expect(second.audits.rows).toHaveLength(5);
		expect(second.audits.rows.at(-1)?.actorId).toBe('user_ancient');
	});
});
