import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { auditEvents, createDatabase, githubInstallations, repositories } from '@legwork/db';
import { HttpProblem, problemFail } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const tenant = await requireTenant(locals);
	const db = createDatabase();
	const [rows, installs] = await Promise.all([
		db.select().from(repositories).where(eq(repositories.organizationId, tenant.organizationId)),
		db
			.select({ id: githubInstallations.id })
			.from(githubInstallations)
			.where(eq(githubInstallations.organizationId, tenant.organizationId))
	]);
	return {
		title: 'Repositories',
		role: tenant.role,
		setupMode: url.searchParams.get('setup') === '1',
		hasInstallation: installs.length > 0,
		repositories: rows.map((repository) => ({
			id: repository.id,
			fullName: repository.fullName,
			defaultBranch: repository.defaultBranch,
			selected: repository.selected,
			archived: repository.archived,
			removedAt: repository.removedAt?.toISOString() ?? null
		}))
	};
};

export const actions: Actions = {
	toggle: async ({ locals, request }) => {
		try {
			const tenant = await requireTenant(locals, 'admin');
			const formData = await request.formData();
			const body = z
				.object({
					repositoryId: z.string().min(1),
					selected: z.enum(['true', 'false']).transform((value) => value === 'true')
				})
				.parse({
					repositoryId: formData.get('repositoryId'),
					selected: formData.get('selected')
				});
			const db = createDatabase();
			const [repository] = await db
				.update(repositories)
				.set({ selected: body.selected, updatedAt: new Date() })
				.where(
					and(
						eq(repositories.id, body.repositoryId),
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
				targetId: body.repositoryId
			});
			return { selected: repository.selected };
		} catch (error) {
			return problemFail(error);
		}
	}
};
