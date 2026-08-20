import { loadIncidentStream } from '$lib/server/incidents';
import { requireTenant } from '$lib/server/tenant';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const tenant = await requireTenant(event.locals);
	const { incidentId } = event.params;
	const request = event.request;
	const encoder = new TextEncoder();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	let previous = '';
	let lastKeepalive = 0;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = async () => {
				if (closed) return;
				let delay = 500;
				try {
					const incident = await loadIncidentStream(tenant.organizationId, incidentId);
					if (closed) return;
					if (!incident) {
						controller.enqueue(
							encoder.encode(
								`event: incident-error\ndata: ${JSON.stringify({ message: 'Not found' })}\n\n`
							)
						);
						controller.close();
						closed = true;
						return;
					}
					// loadIncidentStream returns exactly the fields the client
					// consumes, so serializing it whole keeps the change-dedup
					// below from firing on data the client never reads.
					const serialized = JSON.stringify(incident);
					const status = incident.currentRun?.status;
					if (status === 'completed' || status === 'failed' || status === 'inconclusive')
						delay = 5000;
					if (serialized !== previous) {
						previous = serialized;
						controller.enqueue(encoder.encode(`event: incident\ndata: ${serialized}\n\n`));
						lastKeepalive = Date.now();
					} else if (Date.now() - lastKeepalive >= 15_000) {
						controller.enqueue(encoder.encode(': keepalive\n\n'));
						lastKeepalive = Date.now();
					}
				} catch {
					if (!closed) controller.enqueue(encoder.encode(': retrying\n\n'));
				} finally {
					if (!closed) timer = setTimeout(() => void send(), delay);
				}
			};
			request.signal.addEventListener(
				'abort',
				() => {
					if (closed) return;
					closed = true;
					if (timer) clearTimeout(timer);
					controller.close();
				},
				{ once: true }
			);
			void send();
		},
		cancel() {
			closed = true;
			if (timer) clearTimeout(timer);
		}
	});

	return new Response(stream, {
		headers: {
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'content-type': 'text/event-stream; charset=utf-8',
			'x-accel-buffering': 'no'
		}
	});
};
