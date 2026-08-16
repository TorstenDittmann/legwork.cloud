import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auditEvents, createDatabase, repositories } from '@oncall-ai/db';
import { HttpProblem, problemResponse, readLimitedJson } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals, 'admin');
		const { repositoryId } = event.params;
		const body = z
			.object({ selected: z.boolean() })
			.strict()
			.parse(await readLimitedJson(event.request, 2_048));
		const db = createDatabase();
		const [repository] = await db
			.update(repositories)
			.set({ selected: body.selected, updatedAt: new Date() })
			.where(
				and(
					eq(repositories.id, repositoryId),
					eq(repositories.organizationId, tenant.organizationId),
					isNull(repositories.removedAt)
				)
			)
			.returning();
		if (!repository) throw new HttpProblem(404, 'Not Found', 'Repository not found');
		await db.insert(auditEvents).values({
			organizationId: tenant.organizationId,
			actorId: tenant.userId,
			action: body.selected ? 'repository.selected' : 'repository.unselected',
			targetType: 'repository',
			targetId: repositoryId
		});
		return json(repository);
	} catch (error) {
		return problemResponse(error);
	}
};
