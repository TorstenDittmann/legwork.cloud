import { requireTenant } from "@oncall-ai/auth";
import { loadIncident } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ incidentId: string }> }) {
	const tenant = await requireTenant();
	const { incidentId } = await context.params;
	const encoder = new TextEncoder();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	let previous = "";
	let lastKeepalive = 0;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = async () => {
				if (closed) return;
				try {
					const incident = await loadIncident(tenant.organizationId, incidentId);
					if (closed) return;
					if (!incident) {
						controller.enqueue(
							encoder.encode(
								`event: incident-error\ndata: ${JSON.stringify({ message: "Not found" })}\n\n`,
							),
						);
						controller.close();
						closed = true;
						return;
					}
					const serialized = JSON.stringify(incident);
					if (serialized !== previous) {
						previous = serialized;
						controller.enqueue(encoder.encode(`event: incident\ndata: ${serialized}\n\n`));
						lastKeepalive = Date.now();
					} else if (Date.now() - lastKeepalive >= 15_000) {
						controller.enqueue(encoder.encode(": keepalive\n\n"));
						lastKeepalive = Date.now();
					}
				} catch {
					if (!closed) controller.enqueue(encoder.encode(": retrying\n\n"));
				} finally {
					if (!closed) timer = setTimeout(() => void send(), 500);
				}
			};
			request.signal.addEventListener(
				"abort",
				() => {
					if (closed) return;
					closed = true;
					if (timer) clearTimeout(timer);
					controller.close();
				},
				{ once: true },
			);
			void send();
		},
		cancel() {
			closed = true;
			if (timer) clearTimeout(timer);
		},
	});

	return new Response(stream, {
		headers: {
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"content-type": "text/event-stream; charset=utf-8",
			"x-accel-buffering": "no",
		},
	});
}
