import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { createDatabase, createRetryRun, QuotaExceededError } from '@oncall-ai/db';
import { HttpProblem, problemResponse, readLimitedJson } from '$lib/server/http';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	try {
		const tenant = await requireTenant(event.locals);
		const { incidentId } = event.params;
		const body = z
			.object({ runId: z.string().uuid() })
			.strict()
			.parse(await readLimitedJson(event.request, 4_096));
		const run = await createRetryRun(
			createDatabase(),
			tenant.organizationId,
			incidentId,
			body.runId
		);
		return json({ runId: run.id, status: 'queued' }, { status: 202 });
	} catch (error) {
		if (error instanceof QuotaExceededError)
			return problemResponse(new HttpProblem(429, 'Quota Exceeded', error.message));
		return problemResponse(error);
	}
};
