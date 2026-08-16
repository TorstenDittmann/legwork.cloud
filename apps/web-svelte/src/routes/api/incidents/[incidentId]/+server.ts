import { json } from '@sveltejs/kit';
import { problemResponse } from '$lib/server/http';
import { loadIncident } from '$lib/server/incidents';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals);
		const { incidentId } = event.params;
		const incident = await loadIncident(tenant.organizationId, incidentId);
		if (!incident) return json({ error: 'Not found' }, { status: 404 });
		return json(incident);
	} catch (error) {
		return problemResponse(error);
	}
};
