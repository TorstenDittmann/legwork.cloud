import { and, eq } from 'drizzle-orm';
import { createDatabase, services } from '@oncall-ai/db';
import { requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const tenant = await requireTenant(locals);
	const rows = await createDatabase()
		.select({ id: services.id, name: services.name })
		.from(services)
		.where(and(eq(services.organizationId, tenant.organizationId), eq(services.enabled, true)));
	return { services: rows };
};
