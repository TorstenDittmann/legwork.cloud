import type { WebhookPayload, Subscription as DodoSubscription } from '@dodopayments/core/schemas';
import DodoPayments from 'dodopayments';
import { and, eq } from 'drizzle-orm';
import {
	beginBillingWebhook,
	billingSubscriptions,
	createDatabase,
	failBillingWebhook,
	finishBillingWebhook,
	syncBillingSubscription,
	type BillingSubscriptionStatus
} from '@legwork/db';
import { env } from '$env/dynamic/private';
import {
	FREE_ENTITLEMENTS,
	PAID_ENTITLEMENTS,
	type BillingInterval,
	type PaidPlanSlug
} from '$lib/pricing';

type DodoEnvironment = 'test_mode' | 'live_mode';
type ProductSelection = { plan: PaidPlanSlug; interval: BillingInterval; productId: string };

export class BillingConfigurationError extends Error {}

function environment(): DodoEnvironment {
	if (env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode') return 'test_mode';
	if (env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode') return 'live_mode';
	throw new BillingConfigurationError('DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode');
}

function apiKey(): string {
	if (!env.DODO_PAYMENTS_API_KEY)
		throw new BillingConfigurationError('DODO_PAYMENTS_API_KEY is required');
	return env.DODO_PAYMENTS_API_KEY;
}

export function webhookKey(): string {
	if (!env.DODO_PAYMENTS_WEBHOOK_KEY)
		throw new BillingConfigurationError('DODO_PAYMENTS_WEBHOOK_KEY is required');
	return env.DODO_PAYMENTS_WEBHOOK_KEY;
}

function productId(plan: PaidPlanSlug, interval: BillingInterval): string {
	const key =
		plan === 'team'
			? interval === 'month'
				? 'DODO_PAYMENTS_TEAM_MONTHLY_PRODUCT_ID'
				: 'DODO_PAYMENTS_TEAM_ANNUAL_PRODUCT_ID'
			: interval === 'month'
				? 'DODO_PAYMENTS_SCALE_MONTHLY_PRODUCT_ID'
				: 'DODO_PAYMENTS_SCALE_ANNUAL_PRODUCT_ID';
	const value = env[key];
	if (!value) throw new BillingConfigurationError(`${key} is required`);
	return value;
}

function productSelections(): ProductSelection[] {
	const candidates: Array<[PaidPlanSlug, BillingInterval, string | undefined]> = [
		['team', 'month', env.DODO_PAYMENTS_TEAM_MONTHLY_PRODUCT_ID],
		['team', 'year', env.DODO_PAYMENTS_TEAM_ANNUAL_PRODUCT_ID],
		['scale', 'month', env.DODO_PAYMENTS_SCALE_MONTHLY_PRODUCT_ID],
		['scale', 'year', env.DODO_PAYMENTS_SCALE_ANNUAL_PRODUCT_ID]
	];
	return candidates.flatMap(([plan, interval, value]) =>
		value ? [{ plan, interval, productId: value }] : []
	);
}

function selectionForProduct(product: string): ProductSelection | undefined {
	return productSelections().find(({ productId: configured }) => configured === product);
}

function appUrl(): URL {
	if (!env.APP_URL)
		throw new BillingConfigurationError('APP_URL is required for billing redirects');
	const url = new URL(env.APP_URL);
	if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
		throw new BillingConfigurationError('APP_URL must use HTTPS outside local development');
	return url;
}

function checkoutReturnUrl(): string {
	if (env.DODO_PAYMENTS_RETURN_URL) return new URL(env.DODO_PAYMENTS_RETURN_URL).toString();
	return new URL('/checkout/success', appUrl()).toString();
}

function client(): DodoPayments {
	return new DodoPayments({ bearerToken: apiKey(), environment: environment() });
}

export function isCheckoutConfigured(plan: PaidPlanSlug, interval: BillingInterval): boolean {
	try {
		apiKey();
		environment();
		webhookKey();
		productId(plan, interval);
		checkoutReturnUrl();
		return true;
	} catch (error) {
		if (error instanceof BillingConfigurationError) return false;
		throw error;
	}
}

export async function createCheckout(input: {
	plan: PaidPlanSlug;
	interval: BillingInterval;
	organizationId: string;
	email: string;
	name: string;
}): Promise<string> {
	webhookKey();
	const session = await client().checkoutSessions.create({
		product_cart: [{ product_id: productId(input.plan, input.interval), quantity: 1 }],
		customer: { email: input.email, name: input.name },
		return_url: checkoutReturnUrl(),
		cancel_url: new URL('/pricing?checkout=cancelled', appUrl()).toString(),
		metadata: {
			legwork_organization_id: input.organizationId,
			legwork_plan: input.plan,
			legwork_interval: input.interval
		},
		customization: { theme: 'light', show_order_details: true },
		feature_flags: {
			allow_customer_editing_email: false,
			allow_customer_editing_name: true,
			allow_discount_code: true,
			allow_phone_number_collection: false,
			allow_tax_id: true,
			always_create_new_customer: true,
			redirect_immediately: true
		}
	});
	if (!session.checkout_url) throw new Error('Dodo Payments did not return a checkout URL');
	return session.checkout_url;
}

export async function createCustomerPortal(customerId: string): Promise<string> {
	const session = await client().customers.customerPortal.create(customerId, {
		return_url: new URL('/settings', appUrl()).toString()
	});
	return session.link;
}

export async function getBillingSubscription(organizationId: string) {
	const [subscription] = await createDatabase()
		.select()
		.from(billingSubscriptions)
		.where(eq(billingSubscriptions.organizationId, organizationId))
		.limit(1);
	return subscription ?? null;
}

function isDodoSubscription(
	value: unknown
): value is DodoSubscription & { payload_type: 'Subscription' } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'payload_type' in value &&
		value.payload_type === 'Subscription'
	);
}

function metadataOrganizationId(subscription: DodoSubscription): string | undefined {
	const value = subscription.metadata.legwork_organization_id;
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function syncDodoWebhook(payload: WebhookPayload, webhookId: string): Promise<void> {
	const db = createDatabase();
	if (
		(await beginBillingWebhook(db, {
			id: webhookId,
			eventType: payload.type,
			eventTimestamp: payload.timestamp
		})) === 'duplicate'
	)
		return;

	try {
		if (!isDodoSubscription(payload.data) || !payload.type.startsWith('subscription.')) {
			await finishBillingWebhook(db, webhookId, { status: 'ignored' });
			return;
		}

		const subscription = payload.data;
		const [known] = await db
			.select({ organizationId: billingSubscriptions.organizationId })
			.from(billingSubscriptions)
			.where(
				and(
					eq(billingSubscriptions.provider, 'dodo'),
					eq(billingSubscriptions.subscriptionId, subscription.subscription_id)
				)
			)
			.limit(1);
		const fromMetadata = metadataOrganizationId(subscription);
		if (known && fromMetadata && known.organizationId !== fromMetadata)
			throw new Error('Dodo subscription organization metadata does not match its owner');
		const organizationId = known?.organizationId ?? fromMetadata;
		if (!organizationId) {
			await finishBillingWebhook(db, webhookId, { status: 'ignored' });
			return;
		}

		const selection = selectionForProduct(subscription.product_id);
		if (!selection)
			throw new BillingConfigurationError(
				`No Legwork plan is configured for Dodo product ${subscription.product_id}`
			);
		await syncBillingSubscription(db, {
			organizationId,
			plan: selection.plan,
			billingInterval: selection.interval,
			status: subscription.status as BillingSubscriptionStatus,
			customerId: subscription.customer.customer_id,
			subscriptionId: subscription.subscription_id,
			productId: subscription.product_id,
			cancelAtPeriodEnd: subscription.cancel_at_next_billing_date,
			currentPeriodEnd: subscription.next_billing_date,
			eventAt: payload.timestamp,
			paidEntitlements: PAID_ENTITLEMENTS[selection.plan],
			freeEntitlements: FREE_ENTITLEMENTS
		});
		await finishBillingWebhook(db, webhookId, { status: 'processed', organizationId });
	} catch (error) {
		await failBillingWebhook(db, webhookId, error);
		throw error;
	}
}
