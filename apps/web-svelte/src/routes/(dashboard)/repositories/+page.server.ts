import { eq } from 'drizzle-orm';
import { createDatabase, githubInstallations, repositories } from '@oncall-ai/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
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
		role: tenant.role,
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
