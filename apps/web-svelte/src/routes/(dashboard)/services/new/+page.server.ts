import { and, eq } from 'drizzle-orm';
import { createDatabase, repositories } from '@oncall-ai/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals, 'admin');
	const rows = await createDatabase()
		.select({ id: repositories.id, fullName: repositories.fullName })
		.from(repositories)
		.where(
			and(eq(repositories.organizationId, tenant.organizationId), eq(repositories.selected, true))
		);
	return { repositories: rows };
};
