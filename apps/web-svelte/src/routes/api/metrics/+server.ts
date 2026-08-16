import { metrics } from '@oncall-ai/observability';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return new Response(await metrics.metrics(), {
		headers: { 'content-type': metrics.contentType, 'cache-control': 'no-store' }
	});
};
