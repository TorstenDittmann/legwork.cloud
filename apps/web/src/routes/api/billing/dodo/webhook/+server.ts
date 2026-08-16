import { Webhooks } from '@dodopayments/sveltekit';
import { json } from '@sveltejs/kit';
import { BillingConfigurationError, syncDodoWebhook, webhookKey } from '$lib/server/billing';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	let key: string;
	try {
		key = webhookKey();
	} catch (error) {
		if (error instanceof BillingConfigurationError)
			return json({ error: 'Billing webhook is not configured' }, { status: 503 });
		throw error;
	}
	const webhookId = event.request.headers.get('webhook-id') ?? '';
	const response = await Webhooks({
		webhookKey: key,
		onPayload: (payload) => syncDodoWebhook(payload, webhookId)
	})(event);
	return new Response(await response.text(), {
		status: response.status,
		headers: [...response.headers.entries()]
	});
};
