import { error, redirect } from '@sveltejs/kit';
import {
	BillingConfigurationError,
	createCustomerPortal,
	getBillingSubscription
} from '$lib/server/billing';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const tenant = await requireTenant(locals, 'admin');
	const subscription = await getBillingSubscription(tenant.organizationId);
	if (!subscription) error(404, 'No billing account exists for this organization');
	let portalUrl: string;
	try {
		portalUrl = await createCustomerPortal(subscription.customerId);
	} catch (cause) {
		console.error('Unable to create Dodo Payments customer portal session', cause);
		error(
			cause instanceof BillingConfigurationError ? 503 : 502,
			'Billing management is temporarily unavailable'
		);
	}
	redirect(302, portalUrl);
};
