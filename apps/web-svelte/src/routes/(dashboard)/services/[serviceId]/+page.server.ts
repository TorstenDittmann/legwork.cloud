import { error, fail } from '@sveltejs/kit';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
	alertIntegrations,
	createDatabase,
	providerConnections,
	repositories,
	serviceApiKeys,
	serviceProviderBindings,
	serviceRepositories,
	services
} from '@oncall-ai/db';
import { encryptSecret } from '@oncall-ai/security';
import { env } from '$env/dynamic/private';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const tenant = await requireTenant(locals);
	const { serviceId } = params;
	const db = createDatabase();
	const [[row], mappings, repositoryOptions, connections, alertRows, bindingRows] =
		await Promise.all([
			db
				.select({
					service: {
						id: services.id,
						name: services.name,
						slug: services.slug,
						enabled: services.enabled,
						callbackUrl: services.callbackUrl
					},
					keyPrefix: serviceApiKeys.prefix
				})
				.from(services)
				.leftJoin(
					serviceApiKeys,
					and(eq(serviceApiKeys.serviceId, services.id), eq(serviceApiKeys.active, true))
				)
				.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
				.limit(1),
			db
				.select({
					repositoryId: serviceRepositories.repositoryId,
					role: serviceRepositories.role,
					fullName: repositories.fullName
				})
				.from(serviceRepositories)
				.innerJoin(
					repositories,
					and(
						eq(repositories.id, serviceRepositories.repositoryId),
						eq(repositories.organizationId, tenant.organizationId)
					)
				)
				.where(
					and(
						eq(serviceRepositories.serviceId, serviceId),
						eq(serviceRepositories.organizationId, tenant.organizationId)
					)
				),
			db
				.select({ id: repositories.id, fullName: repositories.fullName })
				.from(repositories)
				.where(
					and(
						eq(repositories.organizationId, tenant.organizationId),
						eq(repositories.selected, true)
					)
				),
			db
				.select({
					id: providerConnections.id,
					name: providerConnections.name,
					provider: providerConnections.provider
				})
				.from(providerConnections)
				.where(
					and(
						eq(providerConnections.organizationId, tenant.organizationId),
						eq(providerConnections.enabled, true),
						isNotNull(providerConnections.lastVerifiedAt)
					)
				),
			db
				.select({
					id: alertIntegrations.id,
					name: alertIntegrations.name,
					provider: alertIntegrations.provider,
					lastReceivedAt: alertIntegrations.lastReceivedAt
				})
				.from(alertIntegrations)
				.where(
					and(
						eq(alertIntegrations.organizationId, tenant.organizationId),
						eq(alertIntegrations.serviceId, serviceId)
					)
				),
			db
				.select({
					id: serviceProviderBindings.id,
					enabled: serviceProviderBindings.enabled,
					name: providerConnections.name,
					provider: providerConnections.provider
				})
				.from(serviceProviderBindings)
				.innerJoin(
					providerConnections,
					eq(providerConnections.id, serviceProviderBindings.connectionId)
				)
				.where(
					and(
						eq(serviceProviderBindings.organizationId, tenant.organizationId),
						eq(serviceProviderBindings.serviceId, serviceId)
					)
				)
		]);
	if (!row) error(404, 'Not found');
	return {
		role: tenant.role,
		serviceId,
		service: row.service,
		keyPrefix: row.keyPrefix,
		mappings,
		repositoryOptions,
		connections,
		alertRows,
		bindingRows
	};
};

function encryptionKey() {
	const value = env.DATA_ENCRYPTION_KEY;
	if (!value) throw new Error('DATA_ENCRYPTION_KEY is required');
	return value;
}

export const actions: Actions = {
	createIntegration: async ({ locals, request }) => {
		try {
			const tenant = await requireTenant(locals);
			if (tenant.role !== 'admin') throw new Error('Administrator access required');
			const formData = await request.formData();
			const serviceId = String(formData.get('serviceId'));
			const provider = formData.get('provider');
			if (provider !== 'grafana' && provider !== 'sentry') throw new Error('Invalid provider');
			const db = createDatabase();
			const [service] = await db
				.select({ id: services.id })
				.from(services)
				.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
				.limit(1);
			if (!service) throw new Error('Service not found');
			const id = crypto.randomUUID();
			const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
			await db.insert(alertIntegrations).values({
				id,
				organizationId: tenant.organizationId,
				serviceId,
				provider,
				name: String(formData.get('name') || `${provider} alerts`).slice(0, 128),
				webhookSecretCiphertext: encryptSecret(
					secret,
					encryptionKey(),
					`alert-integration:${id}:webhook-secret`
				)
			});
			const appUrl = env.APP_URL;
			if (!appUrl) throw new Error('APP_URL is required');
			return { secret, webhookUrl: `${appUrl}/api/v1/integrations/${id}/webhook` };
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not create integration'
			});
		}
	},
	bindConnection: async ({ locals, request }) => {
		const tenant = await requireTenant(locals);
		if (tenant.role !== 'admin') throw new Error('Administrator access required');
		const formData = await request.formData();
		const serviceId = String(formData.get('serviceId'));
		const connectionId = String(formData.get('connectionId'));
		const db = createDatabase();
		const [connection] = await db
			.select()
			.from(providerConnections)
			.where(
				and(
					eq(providerConnections.id, connectionId),
					eq(providerConnections.organizationId, tenant.organizationId),
					eq(providerConnections.enabled, true)
				)
			)
			.limit(1);
		const [service] = await db
			.select()
			.from(services)
			.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
			.limit(1);
		if (!connection || !service) throw new Error('Connection or service not found');
		const existing = await db
			.select({ binding: serviceProviderBindings, connection: providerConnections })
			.from(serviceProviderBindings)
			.innerJoin(
				providerConnections,
				eq(providerConnections.id, serviceProviderBindings.connectionId)
			)
			.where(
				and(
					eq(serviceProviderBindings.serviceId, serviceId),
					eq(serviceProviderBindings.organizationId, tenant.organizationId),
					eq(providerConnections.provider, connection.provider),
					eq(serviceProviderBindings.enabled, true)
				)
			);
		for (const row of existing)
			await db
				.update(serviceProviderBindings)
				.set({ enabled: false, updatedAt: new Date() })
				.where(eq(serviceProviderBindings.id, row.binding.id));
		const policy =
			connection.provider === 'grafana'
				? {
						enabledSignals: connection.capabilities,
						defaultWindowMinutes: 30,
						maxWindowMinutes: 120,
						logsLimit: 200,
						tracesLimit: 20,
						metricSeriesLimit: 20,
						metricPointLimit: 1000
					}
				: {
						eventSelections: ['latest', 'recommended', 'oldest'],
						eventListLimit: 20,
						releaseCommits: connection.capabilities.includes('releases'),
						allowedEnvironments: []
					};
		await db
			.insert(serviceProviderBindings)
			.values({
				organizationId: tenant.organizationId,
				serviceId,
				connectionId,
				enabled: true,
				queryPolicy: policy
			})
			.onConflictDoUpdate({
				target: [serviceProviderBindings.serviceId, serviceProviderBindings.connectionId],
				set: { enabled: true, queryPolicy: policy, updatedAt: new Date() }
			});
	}
};
