import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authenticateServiceRequest: vi.fn() }));

vi.mock('$lib/server/service-auth', () => ({
	authenticateServiceRequest: mocks.authenticateServiceRequest
}));

import { GET } from './+server';

beforeEach(() => {
	mocks.authenticateServiceRequest.mockReset();
});

describe('GET /api/v1/services/:serviceSlug/incidents', () => {
	it('returns the authenticated service readiness payload without secrets', async () => {
		mocks.authenticateServiceRequest.mockResolvedValue({
			id: 'service-1',
			organizationId: 'organization-1',
			name: 'Payments API',
			slug: 'payments-api'
		});

		const response = await GET({
			request: new Request('https://legwork.example/api/v1/services/payments-api/incidents'),
			params: { serviceSlug: 'payments-api' }
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			status: 'ready',
			service: { name: 'Payments API', slug: 'payments-api' }
		});
	});
});
