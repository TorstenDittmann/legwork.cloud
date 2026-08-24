import { and, eq, inArray } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import {
	auditEvents,
	createDatabase,
	repositories,
	serviceApiKeys,
	serviceRepositories,
	services
} from '@legwork/db';
import { encryptSecret, generateApiKey, resolveSafeCallbackUrl } from '@legwork/security';
import { requireEncryptionKey } from '$lib/server/config';
import { HttpProblem, problemFail } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

const schema = z
	.object({
		name: z.string().trim().min(1).max(255),
		slug: z
			.string()
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
			.max(128),
		primaryRepositoryId: z.string().uuid(),
		relatedRepositoryIds: z.array(z.string().uuid()).max(2).default([]),
		callbackUrl: z.string().url().optional(),
		enabled: z.boolean().default(true)
	})
	.strict()
	.refine(
		(value) =>
			!value.relatedRepositoryIds.includes(value.primaryRepositoryId) &&
			new Set(value.relatedRepositoryIds).size === value.relatedRepositoryIds.length,
		'Repositories must be unique'
	);

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals, 'admin');
	const rows = await createDatabase()
		.select({ id: repositories.id, fullName: repositories.fullName })
		.from(repositories)
		.where(
			and(eq(repositories.organizationId, tenant.organizationId), eq(repositories.selected, true))
		);
	if (!rows.length) redirect(302, '/dashboard?missing=repository');
	return { title: 'New Service', repositories: rows };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		try {
			const tenant = await requireTenant(locals, 'admin');
			const formData = await request.formData();
			const input = schema.parse({
				name: formData.get('name'),
				slug: formData.get('slug'),
				primaryRepositoryId: formData.get('primaryRepositoryId'),
				relatedRepositoryIds: formData.getAll('relatedRepositoryIds').filter(Boolean),
				callbackUrl: formData.get('callbackUrl') || undefined,
				enabled: true
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
						inArray(repositories.id, repositoryIds),
						eq(repositories.selected, true)
					)
				);
			if (approved.length !== repositoryIds.length)
				throw new HttpProblem(
					422,
					'Invalid Repository',
					'Every service repository must be selected and owned by the active organization'
				);
			const ingestionKey = generateApiKey();
			const callbackSecret =
				crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
			const encryptionKey = requireEncryptionKey();
			const created = await db.transaction(async (tx) => {
				const [service] = await tx
					.insert(services)
					.values({
						organizationId: tenant.organizationId,
						name: input.name,
						slug: input.slug,
						enabled: input.enabled,
						callbackUrl: input.callbackUrl,
						callbackSecretCiphertext: 'pending'
					})
					.returning();
				if (!service) throw new Error('Failed to create service');
				await tx
					.update(services)
					.set({
						callbackSecretCiphertext: encryptSecret(
							callbackSecret,
							encryptionKey,
							`service:${service.id}:callback`
						)
					})
					.where(eq(services.id, service.id));
				await tx.insert(serviceRepositories).values([
					{
						organizationId: tenant.organizationId,
						serviceId: service.id,
						repositoryId: input.primaryRepositoryId,
						role: 'primary',
						position: 0
					},
					...input.relatedRepositoryIds.map((repositoryId, position) => ({
						organizationId: tenant.organizationId,
						serviceId: service.id,
						repositoryId,
						role: 'related' as const,
						position
					}))
				]);
				await tx.insert(serviceApiKeys).values({
					organizationId: tenant.organizationId,
					serviceId: service.id,
					prefix: ingestionKey.prefix,
					keyHash: ingestionKey.hash
				});
				await tx.insert(auditEvents).values({
					organizationId: tenant.organizationId,
					actorId: tenant.userId,
					action: 'service.created',
					targetType: 'service',
					targetId: service.id,
					metadata: { slug: service.slug }
				});
				return service;
			});
			return {
				service: created,
				ingestionKey: ingestionKey.plaintext,
				callbackSigningSecret: callbackSecret
			};
		} catch (error) {
			return problemFail(error);
		}
	}
};
