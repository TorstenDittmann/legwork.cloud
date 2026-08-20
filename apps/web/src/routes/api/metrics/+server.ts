import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { metrics } from '@legwork/observability';
import type { RequestHandler } from './$types';

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * Prometheus scrape endpoint. The registry exposes org counts, run volumes,
 * and error rates, so it fails closed: without METRICS_TOKEN configured the
 * route does not exist, and with it configured the scraper must present the
 * token as a bearer credential.
 */
export const GET: RequestHandler = async ({ request }) => {
	const token = env.METRICS_TOKEN;
	if (!token) return new Response('Not Found', { status: 404 });
	const authorization = request.headers.get('authorization') ?? '';
	if (!timingSafeEqual(digest(authorization), digest(`Bearer ${token}`)))
		return new Response('Unauthorized', {
			status: 401,
			headers: { 'www-authenticate': 'Bearer' }
		});
	return new Response(await metrics.metrics(), {
		headers: { 'content-type': metrics.contentType, 'cache-control': 'no-store' }
	});
};
