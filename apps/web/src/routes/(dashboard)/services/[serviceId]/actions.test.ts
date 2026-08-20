import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, organizations } from '@legwork/db';
import { actions } from './+page.server';

const db = createDatabase(`/tmp/legwork-service-actions-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_actions', role: 'admin' }
} as never;

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../../packages/db/migrations', import.meta.url)
			.pathname
	});
	await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_actions', name: 'A', slug: 'a' });
});

describe('service actions', () => {
	it('returns a 404 problem instead of crashing when the binding targets are missing', async () => {
		const form = new FormData();
		form.set('serviceId', 'svc-does-not-exist');
		form.set('connectionId', 'conn-does-not-exist');
		const request = new Request('http://localhost/services/x', { method: 'POST', body: form });
		const result = await actions.bindConnection({ locals, request } as never);
		expect(result).toMatchObject({ status: 404 });
	});
});
