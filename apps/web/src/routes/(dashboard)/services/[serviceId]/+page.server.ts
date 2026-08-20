import { error, fail } from '@sveltejs/kit';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
	alertIntegrations,
	auditEvents,
	createDatabase,
	providerConnections,
	repositories,
	serviceApiKeys,
	serviceProviderBindings,
	serviceRepositories,
	services
} from '@legwork/db';
import { providerKindSchema } from '@legwork/contracts';
import { encryptSecret, generateApiKey, resolveSafeCallbackUrl } from '@legwork/security';
import { env } from '$env/dynamic/private';
import { requireEncryptionKey } from '$lib/server/config';
import { HttpProblem, problemFail } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const updateServiceSchema = z
	.object({
		name: z.string().trim().min(1).max(255),
		primaryRepositoryId: z.string().uuid(),
		relatedRepositoryIds: z.array(z.string().uuid()).max(2).default([]),
		callbackUrl: z.union([z.string().url(), z.null()]),
		enabled: z.boolean()
	})
	.strict()
	.refine(
		(value) =>
			!value.relatedRepositoryIds.includes(value.primaryRepositoryId) &&
			new Set(value.relatedRepositoryIds).size === value.relatedRepositoryIds.length,
		'Repositories must be unique'
	);

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
		title: row.service.name,
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

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		try {
			const tenant = await requireTenant(locals, 'admin');
			const { serviceId } = params;
			const formData = await request.formData();
			const input = updateServiceSchema.parse({
				name: formData.get('name'),
				primaryRepositoryId: formData.get('primaryRepositoryId'),
				relatedRepositoryIds: formData.getAll('relatedRepositoryIds').filter(Boolean),
				callbackUrl: formData.get('callbackUrl') || null,
				enabled: formData.get('enabled') === 'on'
			});
			if (input.callbackUrl) await resolveSafeCallbackUrl(input.callbackUrl);
			const db = createDatabase();
			const repositoryIds = [input.primaryRepositoryId, ...input.relatedRepositoryIds];
			const approved = await db
				.select({ id: repositories.id })
				.from(repositories)
				.where(
					and(
						eq(repositories.organizationId, tenant.organizationId),
						eq(repositories.selected, true),
						inArray(repositories.id, repositoryIds)
					)
				);
			if (approved.length !== repositoryIds.length) {
				throw new HttpProblem(
					422,
					'Invalid Repository',
					'Every service repository must be selected and owned by the active organization'
				);
			}
			await db.transaction(
				async (tx) => {
					const [service] = await tx
						.select({ id: services.id })
						.from(services)
						.where(
							and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId))
						)
						.limit(1);
					if (!service) throw new HttpProblem(404, 'Not Found', 'Service not found');
					await tx
						.update(services)
						.set({
							name: input.name,
							enabled: input.enabled,
							callbackUrl: input.callbackUrl,
							updatedAt: new Date()
						})
						.where(
							and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId))
						);
					await tx
						.delete(serviceRepositories)
						.where(
							and(
								eq(serviceRepositories.serviceId, serviceId),
								eq(serviceRepositories.organizationId, tenant.organizationId)
							)
						);
					await tx.insert(serviceRepositories).values([
						{
							organizationId: tenant.organizationId,
							serviceId,
							repositoryId: input.primaryRepositoryId,
							role: 'primary',
							position: 0
						},
						...input.relatedRepositoryIds.map((repositoryId, position) => ({
							organizationId: tenant.organizationId,
							serviceId,
							repositoryId,
							role: 'related' as const,
							position
						}))
					]);
					await tx.insert(auditEvents).values({
						organizationId: tenant.organizationId,
						actorId: tenant.userId,
						action: 'service.updated',
						targetType: 'service',
						targetId: serviceId,
						metadata: { enabled: input.enabled, callbackConfigured: Boolean(input.callbackUrl) }
					});
				},
				{ behavior: 'immediate' }
			);
			return { ok: true };
		} catch (err) {
			return problemFail(err);
		}
	},
	rotate: async ({ locals, params }) => {
		try {
			const tenant = await requireTenant(locals, 'admin');
			const { serviceId } = params;
			const db = createDatabase();
			const [service] = await db
				.select({ id: services.id })
				.from(services)
				.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
				.limit(1);
			if (!service) throw new HttpProblem(404, 'Not Found', 'Service not found');
			const key = generateApiKey();
			await db.transaction(async (tx) => {
				await tx
					.update(serviceApiKeys)
					.set({ active: false, revokedAt: new Date() })
					.where(
						and(
							eq(serviceApiKeys.serviceId, serviceId),
							eq(serviceApiKeys.organizationId, tenant.organizationId),
							eq(serviceApiKeys.active, true)
						)
					);
				await tx.insert(serviceApiKeys).values({
					organizationId: tenant.organizationId,
					serviceId,
					prefix: key.prefix,
					keyHash: key.hash
				});
				await tx.insert(auditEvents).values({
					organizationId: tenant.organizationId,
					actorId: tenant.userId,
					action: 'service.key_rotated',
					targetType: 'service',
					targetId: serviceId
				});
			});
			return { ingestionKey: key.plaintext };
		} catch (err) {
			return problemFail(err);
		}
	},
	createIntegration: async ({ locals, request }) => {
		try {
			const tenant = await requireTenant(locals, 'admin');
			const formData = await request.formData();
			const serviceId = String(formData.get('serviceId'));
			const parsedProvider = providerKindSchema.safeParse(formData.get('provider'));
			if (!parsedProvider.success) throw new Error('Invalid provider');
			const provider = parsedProvider.data;
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
					requireEncryptionKey(),
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
		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const serviceId = String(formData.get('serviceId'));
		const connectionId = String(formData.get('connectionId'));
		const db = createDatabase();
		const [[connection], [service]] = await Promise.all([
			db
				.select()
				.from(providerConnections)
				.where(
					and(
						eq(providerConnections.id, connectionId),
						eq(providerConnections.organizationId, tenant.organizationId),
						eq(providerConnections.enabled, true)
					)
				)
				.limit(1),
			db
				.select()
				.from(services)
				.where(and(eq(services.id, serviceId), eq(services.organizationId, tenant.organizationId)))
				.limit(1)
		]);
		if (!connection || !service)
			return problemFail(new HttpProblem(404, 'Not Found', 'Connection or service not found'));
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
		if (existing.length)
			await db
				.update(serviceProviderBindings)
				.set({ enabled: false, updatedAt: new Date() })
				.where(
					inArray(
						serviceProviderBindings.id,
						existing.map((row) => row.binding.id)
					)
				);
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
