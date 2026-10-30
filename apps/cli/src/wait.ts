import { isTerminalRunStatus, type IncidentResultResponse } from "@legwork/contracts";
import { CliError, UsageError } from "./errors";

export const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const POLL_INTERVAL_MS = 3_000;

export interface WaitOptions {
	timeoutMs: number;
	intervalMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

/** Polls until the incident's current run reaches a terminal status. */
export async function waitForIncident(
	fetchResult: () => Promise<IncidentResultResponse>,
	options: WaitOptions,
): Promise<IncidentResultResponse> {
	const sleep =
		options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const now = options.now ?? Date.now;
	const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
	const deadline = now() + options.timeoutMs;
	for (;;) {
		const result = await fetchResult();
		if (isTerminalRunStatus(result.status)) return result;
		if (now() + intervalMs > deadline)
			throw new CliError(
				`Analysis still ${result.status ?? "pending"} after ${Math.round(options.timeoutMs / 1000)}s: ${result.dashboardUrl}`,
			);
		await sleep(intervalMs);
	}
}

/** 0 when Legwork produced a diagnosis (including an inconclusive one), 1 otherwise. */
export function resultExitCode(result: IncidentResultResponse): number {
	return result.status === "completed" || result.status === "inconclusive" ? 0 : 1;
}

export function parseTimeoutSeconds(value: string | undefined): number {
	if (value === undefined) return DEFAULT_WAIT_TIMEOUT_SECONDS;
	const seconds = Number(value);
	if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3_600)
		throw new UsageError("--timeout must be a whole number of seconds between 1 and 3600");
	return seconds;
}
