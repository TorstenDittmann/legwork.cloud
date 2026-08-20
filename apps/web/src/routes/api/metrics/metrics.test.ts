import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './+server';

const call = (headers: Record<string, string> = {}) =>
	GET({ request: new Request('http://localhost/api/metrics', { headers }) } as never);

afterEach(() => {
	delete process.env.METRICS_TOKEN;
});

describe('GET /api/metrics', () => {
	it('is hidden entirely when no metrics token is configured', async () => {
		delete process.env.METRICS_TOKEN;
		const response = await call();
		expect(response.status).toBe(404);
	});

	it('rejects a missing or wrong bearer token', async () => {
		process.env.METRICS_TOKEN = 'scrape-secret';
		expect((await call()).status).toBe(401);
		expect((await call({ authorization: 'Bearer wrong' })).status).toBe(401);
	});

	it('serves the registry to the configured bearer token', async () => {
		process.env.METRICS_TOKEN = 'scrape-secret';
		const response = await call({ authorization: 'Bearer scrape-secret' });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/plain');
	});
});
