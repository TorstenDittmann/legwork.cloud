export type FeedStep = {
	id: string;
	sequence: number;
	kind: string;
	summary: string;
	detail?: string | null;
	toolName?: string | null;
	durationMs?: number | null;
	correlationId?: string | null;
	createdAt: string | Date;
};

export type FeedEntry = {
	id: string;
	sequence: number;
	kind: string;
	state: 'running' | 'done' | 'failed';
	summary: string;
	startSummary: string;
	detail?: string | null;
	resultDetail?: string | null;
	toolName?: string | null;
	durationMs?: number | null;
	createdAt: string | Date;
	internal: boolean;
};

/** Bookkeeping the transcript records but an investigator rarely wants to read. */
const INTERNAL_KINDS = new Set([
	'system_prompt',
	'final_system_prompt',
	'user_prompt',
	'graph_checkpointed',
	'graph_resumed'
]);

export function foldSteps(steps: FeedStep[]): FeedEntry[] {
	const entries: FeedEntry[] = [];
	const open = new Map<string, FeedEntry>();

	const standalone = (step: FeedStep): FeedEntry => ({
		id: step.id,
		sequence: step.sequence,
		kind: step.kind,
		state: step.kind.endsWith('_failed') ? 'failed' : 'done',
		summary: step.summary,
		startSummary: step.summary,
		detail: step.detail,
		toolName: step.toolName,
		durationMs: step.durationMs,
		createdAt: step.createdAt,
		internal: INTERNAL_KINDS.has(step.kind)
	});

	for (const step of steps) {
		if (step.kind.endsWith('_started') && step.correlationId) {
			const entry: FeedEntry = {
				id: step.id,
				sequence: step.sequence,
				kind: step.kind,
				state: 'running',
				summary: step.summary,
				startSummary: step.summary,
				detail: step.detail,
				toolName: step.toolName,
				durationMs: step.durationMs,
				createdAt: step.createdAt,
				internal: INTERNAL_KINDS.has(step.kind)
			};
			open.set(step.correlationId, entry);
			entries.push(entry);
			continue;
		}

		const resolves = step.kind.endsWith('_completed') || step.kind.endsWith('_failed');
		if (resolves && step.correlationId) {
			const pending = open.get(step.correlationId);
			if (pending) {
				pending.state = step.kind.endsWith('_failed') ? 'failed' : 'done';
				pending.summary = step.summary;
				pending.resultDetail = step.detail;
				pending.durationMs = step.durationMs ?? pending.durationMs;
				pending.toolName = pending.toolName ?? step.toolName;
				open.delete(step.correlationId);
				continue;
			}
		}

		// No correlation id (legacy rows), or a completion whose start we never saw:
		// show it on its own rather than dropping evidence from the transcript.
		entries.push(standalone(step));
	}

	return entries;
}
