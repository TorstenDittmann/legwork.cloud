import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { createDatabase, repositories } from '@oncall-ai/db';
import { problemResponse } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals);
		const rows = await createDatabase()
			.select({
				id: repositories.id,
				fullName: repositories.fullName,
				defaultBranch: repositories.defaultBranch,
				selected: repositories.selected,
				archived: repositories.archived,
				removedAt: repositories.removedAt
			})
			.from(repositories)
			.where(eq(repositories.organizationId, tenant.organizationId));
		return json(
			rows.map((row) => ({
				...row,
				removedAt: row.removedAt?.toISOString() ?? null
			}))
		);
	} catch (error) {
		return problemResponse(error);
	}
};
