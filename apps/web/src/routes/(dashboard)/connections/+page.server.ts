import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auditEvents, createDatabase, providerConnections } from '@legwork/db';
import {
	assertSafeProviderUrl,
	discoverGrafanaDatasources,
	discoverSentryProjects,
	inferProviderMode,
	IntegrationProviderError,
	investigationContextProviders
} from '@legwork/integrations';
import {
	providerKindSchema,
	type ProviderCredential,
	type ResolvedProviderConnection
} from '@legwork/contracts';
import { decryptSecret, encryptSecret } from '@legwork/security';
import { requireEncryptionKey } from '$lib/server/config';
import { HttpProblem, problemFail } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { ConnectionActionState, DiscoveryState } from './state';
import type { Actions, PageServerLoad } from './$types';

function errorCode(error: unknown) {
	return error instanceof IntegrationProviderError ? error.code : 'PROVIDER_UNAVAILABLE';
}

function connectionAudit(
	organizationId: string,
	actorId: string,
	action: string,
	connectionId: string,
	metadata: Record<string, string | number | boolean | null> = {}
) {
	return {
		organizationId,
		actorId,
		action,
		targetType: 'provider_connection',
		targetId: connectionId,
		metadata
	};
}

const discoverySchema = z.object({
	provider: providerKindSchema,
	baseUrl: z.string().url(),
	token: z.string().min(1).max(16_384)
});

const inputSchema = z
	.object({
		provider: providerKindSchema,
		name: z.string().trim().min(1).max(128),
		baseUrl: z.string().url(),
		token: z.string().min(1).max(16_384),
		organizationSlug: z.string().max(128).optional(),
		projectSlug: z.string().max(128).optional(),
		logsUid: z.string().max(128).optional(),
		metricsUid: z.string().max(128).optional(),
		tracesUid: z.string().max(128).optional()
	})
	.refine(
		(value) => value.provider !== 'sentry' || Boolean(value.organizationSlug && value.projectSlug),
		{ message: 'Sentry organization and project slugs are required', path: ['organizationSlug'] }
	)
	.refine(
		(value) =>
			value.provider !== 'grafana' || Boolean(value.logsUid || value.metricsUid || value.tracesUid),
		{ message: 'Select at least one Grafana data source', path: ['logsUid'] }
	);

async function verifyRecord(record: ResolvedProviderConnection) {
	const db = createDatabase();
	const result = await investigationContextProviders[record.config.provider].testConnection(record);
	await db
		.update(providerConnections)
		.set({
			lastVerifiedAt: result.ok ? new Date() : null,
			lastVerificationError: result.errorCode ?? null,
			updatedAt: new Date()
		})
		.where(
			and(
				eq(providerConnections.id, record.id),
				eq(providerConnections.organizationId, record.organizationId)
			)
		);
	return result;
}

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const connections = await createDatabase()
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.organizationId, tenant.organizationId));
	return {
		title: 'Connections',
		role: tenant.role,
		connections: connections.map((connection) => ({
			id: connection.id,
			name: connection.name,
			provider: connection.provider,
			mode: connection.mode,
			baseUrl: connection.baseUrl,
			capabilities: connection.capabilities,
			enabled: connection.enabled,
			lastVerifiedAt: connection.lastVerifiedAt,
			lastVerificationError: connection.lastVerificationError
		}))
	};
};

export const actions: Actions = {
	discoverConnection: async ({ locals, request }) => {
		await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const parsed = discoverySchema.safeParse(Object.fromEntries(formData));
		if (!parsed.success)
			return fail(400, {
				discovery: { status: 'error', code: 'PROVIDER_QUERY_INVALID' } satisfies DiscoveryState
			});
		try {
			await assertSafeProviderUrl(parsed.data.baseUrl);
			const discovery: DiscoveryState =
				parsed.data.provider === 'grafana'
					? {
							status: 'ok',
							provider: 'grafana',
							datasources: await discoverGrafanaDatasources(parsed.data.baseUrl, parsed.data.token)
						}
					: {
							status: 'ok',
							provider: 'sentry',
							projects: await discoverSentryProjects(parsed.data.baseUrl, parsed.data.token)
						};
			return { discovery };
		} catch (error) {
			return fail(400, {
				discovery: { status: 'error', code: errorCode(error) } satisfies DiscoveryState
			});
		}
	},
	createConnection: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const entries = Object.fromEntries([...formData.entries()].filter(([, value]) => value !== ''));
		const parsed = inputSchema.safeParse(entries);
		if (!parsed.success)
			return fail(400, {
				saved: {
					status: 'error',
					code: parsed.error.issues[0]?.message ?? 'Invalid input'
				} satisfies ConnectionActionState
			});
		const data = parsed.data;
		try {
			await assertSafeProviderUrl(data.baseUrl);
		} catch (error) {
			return fail(400, {
				saved: { status: 'error', code: errorCode(error) } satisfies ConnectionActionState
			});
		}
		const mode = inferProviderMode(data.provider, data.baseUrl);
		const id = crypto.randomUUID();
		const config =
			data.provider === 'grafana'
				? {
						provider: 'grafana' as const,
						mode: mode as 'grafana_cloud' | 'grafana_http',
						grafanaUrl: data.baseUrl,
						...(data.logsUid ? { logs: { uid: data.logsUid, type: 'loki' as const } } : {}),
						...(data.metricsUid
							? { metrics: { uid: data.metricsUid, type: 'prometheus' as const } }
							: {}),
						...(data.tracesUid ? { traces: { uid: data.tracesUid, type: 'tempo' as const } } : {})
					}
				: {
						provider: 'sentry' as const,
						mode: mode as 'sentry_cloud' | 'sentry_http',
						sentryUrl: data.baseUrl,
						organizationSlug: data.organizationSlug ?? '',
						projectSlug: data.projectSlug ?? ''
					};
		const credential: ProviderCredential =
			data.provider === 'sentry'
				? { provider: 'sentry', apiToken: data.token }
				: mode === 'grafana_cloud'
					? { provider: 'grafana', mode: 'grafana_cloud', accessPolicyToken: data.token }
					: { provider: 'grafana', mode: 'grafana_http', serviceAccountToken: data.token };
		const capabilities =
			data.provider === 'sentry'
				? (['issues', 'events', 'releases'] as const)
				: ([
						data.logsUid && 'logs',
						data.metricsUid && 'metrics',
						data.tracesUid && 'traces'
					].filter(Boolean) as Array<'logs' | 'metrics' | 'traces'>);
		await createDatabase()
			.insert(providerConnections)
			.values({
				id,
				organizationId: tenant.organizationId,
				provider: data.provider,
				name: data.name,
				mode,
				baseUrl: data.baseUrl,
				config,
				credentialsCiphertext: encryptSecret(
					JSON.stringify(credential),
					requireEncryptionKey(),
					`provider-connection:${id}:credentials`
				),
				capabilities: [...capabilities]
			});
		const verification = await verifyRecord({
			id,
			organizationId: tenant.organizationId,
			config,
			credential,
			capabilities: [...capabilities]
		});
		await createDatabase()
			.insert(auditEvents)
			.values(
				connectionAudit(tenant.organizationId, tenant.userId, 'connection.created', id, {
					provider: data.provider,
					name: data.name,
					verified: verification.ok
				})
			);
		return {
			saved: (verification.ok
				? { status: 'created' }
				: {
						status: 'created_unverified',
						code: verification.errorCode ?? 'PROVIDER_UNAVAILABLE'
					}) satisfies ConnectionActionState
		};
	},
	testConnection: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const id = String(formData.get('id'));
		const db = createDatabase();
		const [record] = await db
			.select()
			.from(providerConnections)
			.where(
				and(
					eq(providerConnections.id, id),
					eq(providerConnections.organizationId, tenant.organizationId)
				)
			)
			.limit(1);
		if (!record) return problemFail(new HttpProblem(404, 'Not Found', 'Connection not found'));
		const verification = await verifyRecord({
			id: record.id,
			organizationId: record.organizationId,
			config: record.config,
			credential: JSON.parse(
				decryptSecret(
					record.credentialsCiphertext,
					requireEncryptionKey(),
					`provider-connection:${record.id}:credentials`
				)
			),
			capabilities: record.capabilities
		});
		await db.insert(auditEvents).values(
			connectionAudit(tenant.organizationId, tenant.userId, 'connection.tested', record.id, {
				verified: verification.ok
			})
		);
	},
	toggleConnection: async ({ locals, request }) => {
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const id = String(formData.get('id'));
		const enabled = formData.get('enabled') === 'true';
		const db = createDatabase();
		const toggled = await db
			.update(providerConnections)
			.set({ enabled, updatedAt: new Date() })
			.where(
				and(
					eq(providerConnections.id, id),
					eq(providerConnections.organizationId, tenant.organizationId)
				)
			)
			.returning({ id: providerConnections.id });
		if (toggled.length > 0)
			await db.insert(auditEvents).values(
				connectionAudit(tenant.organizationId, tenant.userId, 'connection.toggled', id, {
					enabled
				})
			);
	}
};
