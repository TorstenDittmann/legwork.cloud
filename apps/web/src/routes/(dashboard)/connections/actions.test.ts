import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { and, eq } from 'drizzle-orm';
import { auditEvents, createDatabase, organizations, providerConnections } from '@legwork/db';
import { actions } from './+page.server';

const db = createDatabase(`/tmp/legwork-connections-actions-test-${process.pid}.db`);

const locals = {
	auth: { user: { id: 'user_1' }, organizationId: 'org_actions', role: 'admin' }
} as never;

beforeAll(async () => {
	await migrate(db, {
		migrationsFolder: new URL('../../../../../../packages/db/migrations', import.meta.url).pathname
	});
	await db
		.insert(organizations)
		.values({ workosOrganizationId: 'org_actions', name: 'A', slug: 'a' });
});

describe('connections actions', () => {
	it('returns a 404 problem instead of crashing when the connection is missing', async () => {
		const form = new FormData();
		form.set('id', 'conn-does-not-exist');
		const request = new Request('http://localhost/connections', { method: 'POST', body: form });
		const result = await actions.testConnection({ locals, request } as never);
		expect(result).toMatchObject({ status: 404 });
	});

	it('records an audit event when a connection is toggled', async () => {
		const [organization] = await db
			.select()
			.from(organizations)
			.where(eq(organizations.workosOrganizationId, 'org_actions'));
		await db.insert(providerConnections).values({
			id: 'conn-audited',
			organizationId: organization!.id,
			provider: 'grafana',
			name: 'Grafana',
			mode: 'grafana_http',
			baseUrl: 'https://grafana.example.com',
			config: { provider: 'grafana', mode: 'grafana_http', grafanaUrl: 'https://g.example.com' },
			credentialsCiphertext: 'v1.a.b.c',
			capabilities: ['logs']
		} as never);
		const form = new FormData();
		form.set('id', 'conn-audited');
		form.set('enabled', 'false');
		const request = new Request('http://localhost/connections', { method: 'POST', body: form });
		await actions.toggleConnection({ locals, request } as never);
		const [audit] = await db
			.select()
			.from(auditEvents)
			.where(
				and(
					eq(auditEvents.organizationId, organization!.id),
					eq(auditEvents.action, 'connection.toggled')
				)
			);
		expect(audit).toMatchObject({
			actorId: 'user_1',
			targetType: 'provider_connection',
			targetId: 'conn-audited',
			metadata: { enabled: false }
		});
	});
});
