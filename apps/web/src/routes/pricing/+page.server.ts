import { fail, redirect } from '@sveltejs/kit';
import { authKit } from '@workos/authkit-sveltekit';
import {
	BillingConfigurationError,
	createCheckout,
	getBillingSubscription,
	isCheckoutConfigured
} from '$lib/server/billing';
import { isOnboarded, requireTenant } from '$lib/server/tenant';
import { isBillingInterval, isPaidPlan } from '$lib/pricing';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.auth.user)
		return {
			title: 'Pricing',
			authState: 'guest' as const,
			role: null,
			subscription: null,
			checkoutCancelled: url.searchParams.get('checkout') === 'cancelled'
		};
	if (!(await isOnboarded(locals)))
		return {
			title: 'Pricing',
			authState: 'needs-onboarding' as const,
			role: null,
			subscription: null,
			checkoutCancelled: url.searchParams.get('checkout') === 'cancelled'
		};

	const tenant = await requireTenant(locals);
	const subscription = await getBillingSubscription(tenant.organizationId);
	return {
		title: 'Pricing',
		authState: 'onboarded' as const,
		role: tenant.role,
		subscription: subscription
			? {
					plan: subscription.plan,
					status: subscription.status,
					billingInterval: subscription.billingInterval
				}
			: null,
		checkoutCancelled: url.searchParams.get('checkout') === 'cancelled'
	};
};

export const actions: Actions = {
	checkout: async ({ locals, request }) => {
		if (!locals.auth.user) redirect(303, await authKit.getSignInUrl({ returnTo: '/pricing' }));
		if (!(await isOnboarded(locals))) redirect(303, '/onboarding?returnTo=/pricing');

		const tenant = await requireTenant(locals, 'admin');
		const formData = await request.formData();
		const plan = String(formData.get('plan') ?? '');
		const interval = String(formData.get('interval') ?? '');
		if (!isPaidPlan(plan) || !isBillingInterval(interval))
			return fail(400, { message: 'Choose a valid plan and billing interval.' });

		const current = await getBillingSubscription(tenant.organizationId);
		if (current && ['pending', 'active', 'on_hold', 'paused'].includes(current.status))
			redirect(303, '/billing/portal');
		if (!isCheckoutConfigured(plan, interval))
			return fail(503, {
				message: 'Checkout is not configured yet. Email hello@legwork.cloud and we will help.'
			});

		let checkoutUrl: string;
		try {
			checkoutUrl = await createCheckout({
				plan,
				interval,
				organizationId: tenant.organizationId,
				email: locals.auth.user.email,
				name: locals.auth.user.email.split('@')[0] ?? 'Legwork customer'
			});
		} catch (error) {
			console.error('Unable to create Dodo Payments checkout', error);
			return fail(error instanceof BillingConfigurationError ? 503 : 502, {
				message:
					error instanceof BillingConfigurationError
						? 'Checkout is not configured yet. Email hello@legwork.cloud and we will help.'
						: 'Checkout could not be started. Please try again.'
			});
		}
		redirect(303, checkoutUrl);
	}
};
