import { eq } from 'drizzle-orm';
import { createDatabase, services } from '@oncall-ai/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const rows = await createDatabase()
		.select({
			id: services.id,
			name: services.name,
			slug: services.slug,
			enabled: services.enabled
		})
		.from(services)
		.where(eq(services.organizationId, tenant.organizationId));
	return { role: tenant.role, services: rows };
};
