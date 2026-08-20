/**
 * Deliberately shorter than the callback ladder in `apps/worker/src/callbacks.ts`. A customer's
 * ingest endpoint is worth chasing for a day; an incident notification that lands a day late is
 * noise.
 */
export const NOTIFICATION_RETRY_DELAYS = [30, 120, 600] as const;

/** Upper bound on an attacker- or bug-supplied `Retry-After`, so a job cannot be parked. */
const MAX_RETRY_AFTER_SECONDS = 900;

export type DeliveryOutcome =
	| { kind: "delivered"; status: number }
	| { kind: "retry"; delaySeconds: number; status?: number | undefined; error: string }
	| { kind: "permanent"; status?: number | undefined; error: string };

function ladder(attempt: number, status: number | undefined, error: string): DeliveryOutcome {
	const delaySeconds = NOTIFICATION_RETRY_DELAYS[attempt];
	return delaySeconds === undefined
		? { kind: "permanent", status, error }
		: { kind: "retry", delaySeconds, status, error };
}

function parseRetryAfter(value: string | null | undefined): number | null {
	if (!value) return null;
	const seconds = Number(value.trim());
	if (!Number.isFinite(seconds) || seconds < 0) return null;
	return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
}

export function classifyResponse(
	status: number,
	attempt: number,
	retryAfter?: string | null,
): DeliveryOutcome {
	if (status >= 200 && status < 300) return { kind: "delivered", status };
	if (status === 429) {
		const requested = parseRetryAfter(retryAfter);
		return requested === null
			? ladder(attempt, status, "Rate limited")
			: { kind: "retry", delaySeconds: requested, status, error: "Rate limited" };
	}
	// A request timeout is transient infrastructure trouble, not a revoked webhook.
	if (status === 408) return ladder(attempt, status, "Destination timed out");
	// A deleted or revoked webhook answers 4xx forever; retrying only delays telling the operator.
	if (status >= 400 && status < 500)
		return { kind: "permanent", status, error: `Destination rejected the message (${status})` };
	return ladder(attempt, status, `Destination returned ${status}`);
}

export function classifyTransportError(error: unknown, attempt: number): DeliveryOutcome {
	const message = error instanceof Error ? error.message.slice(0, 2_000) : "Delivery failed";
	return ladder(attempt, undefined, message);
}
