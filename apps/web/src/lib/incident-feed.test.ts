import { describe, expect, it } from 'vitest';
import { foldSteps, type FeedStep } from './incident-feed';

const step = (partial: Partial<FeedStep> & Pick<FeedStep, 'sequence' | 'kind'>): FeedStep => ({
	id: `step-${partial.sequence}`,
	summary: `summary ${partial.sequence}`,
	detail: null,
	toolName: null,
	durationMs: null,
	correlationId: null,
	createdAt: '2026-08-16T12:00:00.000Z',
	...partial
});

describe('foldSteps', () => {
	it('folds a started/completed pair sharing a correlation id into one completed entry', () => {
		const entries = foldSteps([
			step({
				sequence: 1,
				kind: 'tool_started',
				summary: 'read_file internal/cache/layers.go',
				toolName: 'read_file',
				correlationId: 'call-a'
			}),
			step({
				sequence: 2,
				kind: 'tool_completed',
				summary: 'read 14 lines',
				toolName: 'read_file',
				durationMs: 42,
				correlationId: 'call-a'
			})
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			state: 'done',
			toolName: 'read_file',
			durationMs: 42,
			summary: 'read 14 lines',
			startSummary: 'read_file internal/cache/layers.go'
		});
	});

	it('keeps a start with no completion in the running state', () => {
		const entries = foldSteps([
			step({ sequence: 1, kind: 'tool_started', toolName: 'run_check', correlationId: 'call-a' })
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ state: 'running', durationMs: null });
	});

	it('pairs concurrent same-tool calls by correlation id when completions arrive out of order', () => {
		const entries = foldSteps([
			step({
				sequence: 1,
				kind: 'tool_started',
				summary: 'read_file a.go',
				toolName: 'read_file',
				correlationId: 'call-a'
			}),
			step({
				sequence: 2,
				kind: 'tool_started',
				summary: 'read_file b.go',
				toolName: 'read_file',
				correlationId: 'call-b'
			}),
			step({
				sequence: 3,
				kind: 'tool_completed',
				summary: 'b.go result',
				toolName: 'read_file',
				durationMs: 10,
				correlationId: 'call-b'
			}),
			step({
				sequence: 4,
				kind: 'tool_completed',
				summary: 'a.go result',
				toolName: 'read_file',
				durationMs: 99,
				correlationId: 'call-a'
			})
		]);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			startSummary: 'read_file a.go',
			summary: 'a.go result',
			durationMs: 99
		});
		expect(entries[1]).toMatchObject({
			startSummary: 'read_file b.go',
			summary: 'b.go result',
			durationMs: 10
		});
	});

	it('passes unpaired kinds through as their own entries', () => {
		const entries = foldSteps([
			step({ sequence: 1, kind: 'reasoning', summary: 'Considering the evict path' }),
			step({ sequence: 2, kind: 'validation', summary: 'All evidence validated' })
		]);

		expect(entries.map((entry) => entry.kind)).toEqual(['reasoning', 'validation']);
		expect(entries.every((entry) => entry.state === 'done')).toBe(true);
	});

	it('renders legacy steps without a correlation id individually rather than dropping them', () => {
		const entries = foldSteps([
			step({ sequence: 1, kind: 'tool_started', summary: 'read_file a.go', toolName: 'read_file' }),
			step({ sequence: 2, kind: 'tool_completed', summary: 'a.go result', toolName: 'read_file' })
		]);

		expect(entries).toHaveLength(2);
		expect(entries.map((entry) => entry.summary)).toEqual(['read_file a.go', 'a.go result']);
	});

	it('marks a correlated failure as failed and keeps the failure summary', () => {
		const entries = foldSteps([
			step({
				sequence: 1,
				kind: 'node_started',
				summary: 'analyze started',
				correlationId: 'node-1'
			}),
			step({
				sequence: 2,
				kind: 'node_failed',
				summary: 'analyze failed: timeout',
				correlationId: 'node-1'
			})
		]);

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ state: 'failed', summary: 'analyze failed: timeout' });
	});

	it('reports an uncorrelated failure as failed rather than done', () => {
		const entries = foldSteps([
			step({ sequence: 1, kind: 'analysis_failed', summary: 'Analysis failed: sandbox timeout' })
		]);

		expect(entries[0]).toMatchObject({ state: 'failed' });
	});

	it('flags bookkeeping kinds as internal', () => {
		const entries = foldSteps([
			step({ sequence: 1, kind: 'system_prompt', summary: 'prompt' }),
			step({ sequence: 2, kind: 'graph_checkpointed', summary: 'checkpoint' }),
			step({ sequence: 3, kind: 'reasoning', summary: 'thinking' })
		]);

		expect(entries.map((entry) => entry.internal)).toEqual([true, true, false]);
	});
});
