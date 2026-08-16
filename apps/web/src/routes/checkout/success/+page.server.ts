import { getBillingSubscription } from '$lib/server/billing';
import { isOnboarded, requireTenant } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const checkoutStatus = url.searchParams.get('status');
	if (!locals.auth.user || !(await isOnboarded(locals)))
		return { title: 'Checkout', subscription: null, checkoutStatus };
	const tenant = await requireTenant(locals);
	const subscription = await getBillingSubscription(tenant.organizationId);
	return {
		title: 'Checkout',
		checkoutStatus,
		subscription: subscription ? { plan: subscription.plan, status: subscription.status } : null
	};
};
