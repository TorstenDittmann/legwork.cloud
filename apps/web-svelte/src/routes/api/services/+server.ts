import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import {
	auditEvents,
	createDatabase,
	repositories,
	serviceApiKeys,
	serviceRepositories,
	services
} from '@oncall-ai/db';
import { encryptSecret, generateApiKey, resolveSafeCallbackUrl } from '@oncall-ai/security';
import { HttpProblem, problemResponse, readLimitedJson } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals);
		return json(
			await createDatabase()
				.select()
				.from(services)
				.where(eq(services.organizationId, tenant.organizationId))
		);
	} catch (error) {
		return problemResponse(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals, 'admin');
		const input = schema.parse(await readLimitedJson(event.request, 32_000));
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
		const encryptionKey = env.DATA_ENCRYPTION_KEY;
		if (!encryptionKey) throw new Error('DATA_ENCRYPTION_KEY is required');
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
		return json(
			{
				service: created,
				ingestionKey: ingestionKey.plaintext,
				callbackSigningSecret: callbackSecret
			},
			{ status: 201, headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		return problemResponse(error);
	}
};
