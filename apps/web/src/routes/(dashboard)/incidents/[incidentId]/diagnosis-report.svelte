<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Clipboard, ExternalLink, Share2 } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Textarea from '$lib/components/ui/textarea.svelte';
	import { statusTone } from '$lib/components/ui/status';
	import { formatDateTime } from '$lib/utils';
	import type { Diagnosis } from '@legwork/contracts';

	type Evidence = Diagnosis['evidence'][number];
	type FeedbackVerdict = 'confirmed' | 'helpful' | 'incorrect' | 'still_investigating';
	type Feedback = { verdict: FeedbackVerdict; note: string | null };
	type Revision = { repositoryId: string; sha: string };
	type Repository = { id: string; fullName: string };

	const feedbackOptions: Array<{ value: FeedbackVerdict; label: string }> = [
		{ value: 'confirmed', label: 'Confirmed root cause' },
		{ value: 'helpful', label: 'Helpful' },
		{ value: 'incorrect', label: 'Incorrect' },
		{ value: 'still_investigating', label: 'Still investigating' }
	];
	const exhibitId = (index: number) => `E-${String(index + 1).padStart(2, '0')}`;

	let {
		diagnosis,
		runId = null,
		feedback: initialFeedback = null,
		resolvedAt: initialResolvedAt = null,
		revisions = [],
		repositories = []
	}: {
		diagnosis: Diagnosis | null;
		runId?: string | null;
		feedback?: Feedback | null;
		resolvedAt?: string | Date | null;
		revisions?: Revision[] | null;
		repositories?: Repository[];
	} = $props();

	let copyMessage = $state('');
	let feedbackMessage = $state('');
	let feedbackError = $state('');
	let feedbackPending = $state(false);
	let resolutionMessage = $state('');
	let resolutionError = $state('');
	let resolutionPending = $state(false);
	// A different incident or historical run remounts this component. Form mutations update
	// these fields immediately while the live stream catches up.
	// svelte-ignore state_referenced_locally
	let verdict = $state<FeedbackVerdict | ''>(initialFeedback?.verdict ?? '');
	// svelte-ignore state_referenced_locally
	let note = $state(initialFeedback?.note ?? '');
	// svelte-ignore state_referenced_locally
	let savedFeedback = $state<Feedback | null>(initialFeedback);
	// svelte-ignore state_referenced_locally
	let resolvedAt = $state<string | Date | null>(initialResolvedAt);

	function reportText(value: Diagnosis) {
		const lines = [value.status === 'diagnosed' ? 'Diagnosis' : 'Inconclusive investigation'];
		if (value.rootCause) {
			lines.push(
				'',
				`Root cause (${Math.round(value.rootCause.confidence * 100)}% confidence)`,
				value.rootCause.statement
			);
		}
		lines.push('', 'What happened', value.summary);
		if (value.suggestedFix) {
			lines.push('', 'Recommended next action', value.suggestedFix.description);
			lines.push(...value.suggestedFix.steps.map((step, index) => `${index + 1}. ${step}`));
		}
		if (value.evidence.length) {
			lines.push('', 'Evidence');
			lines.push(
				...value.evidence.map((evidence, index) => {
					const location =
						'path' in evidence
							? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
							: 'command' in evidence
								? evidence.command
								: evidence.operation;
					return `${exhibitId(index)} ${location}\n${evidence.explanation}`;
				})
			);
		}
		return lines.join('\n');
	}

	const repositoryFor = (repositoryId: string) =>
		repositories.find((repository) => repository.id === repositoryId);
	const revisionFor = (repositoryId: string) =>
		(revisions ?? []).find((revision) => revision.repositoryId === repositoryId);
	const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/');

	function githubFileUrl(evidence: Evidence) {
		if (!('path' in evidence)) return null;
		const repository = repositoryFor(evidence.repositoryId);
		const revision = revisionFor(evidence.repositoryId);
		if (!repository || !revision) return null;
		return `https://github.com/${encodePath(repository.fullName)}/blob/${encodeURIComponent(revision.sha)}/${encodePath(evidence.path)}#L${evidence.lineStart}-L${evidence.lineEnd}`;
	}

	async function copyText(value: string, successMessage: string) {
		try {
			await navigator.clipboard.writeText(value);
			copyMessage = successMessage;
		} catch {
			copyMessage = 'Copy failed. Select the report text and copy it manually.';
		}
	}

	async function shareReport(value: Diagnosis) {
		const text = reportText(value);
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Legwork diagnosis', text, url: window.location.href });
				copyMessage = 'Report shared.';
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				await copyText(`${text}\n\n${window.location.href}`, 'Share link copied.');
			}
			return;
		}
		await copyText(`${text}\n\n${window.location.href}`, 'Share link copied.');
	}

	const feedbackEnhance: SubmitFunction = ({ cancel }) => {
		if (!runId || !verdict || feedbackPending) {
			cancel();
			return;
		}
		feedbackPending = true;
		feedbackMessage = '';
		feedbackError = '';
		return async ({ result }) => {
			if (result.type === 'success') {
				savedFeedback = { verdict: verdict as FeedbackVerdict, note: note.trim() || null };
				feedbackMessage = 'Outcome saved. Thank you—this will improve future investigations.';
			} else if (result.type === 'failure') {
				feedbackError = String(
					result.data?.errors?.note?.[0] ?? result.data?.detail ?? 'Unable to save the outcome.'
				);
			} else if (result.type === 'error') {
				feedbackError =
					result.error instanceof Error ? result.error.message : 'Unable to save the outcome.';
			}
			feedbackPending = false;
		};
	};

	const resolutionEnhance: SubmitFunction = ({ cancel }) => {
		if (resolutionPending) {
			cancel();
			return;
		}
		const resolving = !resolvedAt;
		resolutionPending = true;
		resolutionMessage = '';
		resolutionError = '';
		return async ({ result }) => {
			if (result.type === 'success') {
				resolvedAt = resolving ? new Date() : null;
				resolutionMessage = resolving ? 'Incident marked resolved.' : 'Incident reopened.';
			} else if (result.type === 'failure') {
				resolutionError = String(result.data?.detail ?? 'Unable to update the incident.');
			} else if (result.type === 'error') {
				resolutionError =
					result.error instanceof Error ? result.error.message : 'Unable to update the incident.';
			}
			resolutionPending = false;
		};
	};
</script>

<div class="mt-10 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
	<div class="min-w-0 space-y-5">
		{#if diagnosis}
			<Card class="min-w-0 overflow-hidden border-t-2 border-t-accent">
				<CardHeader class="flex min-w-0 flex-wrap items-center justify-between gap-3">
					<CardTitle class="text-2xl text-balance">
						{diagnosis.status === 'diagnosed' ? 'Diagnosis' : 'Inconclusive'}
					</CardTitle>
					<div class="flex max-w-full flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onclick={() => copyText(reportText(diagnosis), 'Report copied.')}
						>
							<Clipboard class="size-3.5" aria-hidden="true" />
							Copy report
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onclick={() => shareReport(diagnosis)}
						>
							<Share2 class="size-3.5" aria-hidden="true" />
							Share
						</Button>
					</div>
				</CardHeader>
				<CardContent class="min-w-0">
					<p aria-live="polite" class="mb-3 min-h-5 text-xs text-success">{copyMessage}</p>
					{#if diagnosis.rootCause}
						<div class="rounded-lg border border-accent/20 bg-accent-soft px-5 py-4">
							<p class="text-xs font-semibold tracking-wide text-accent uppercase">Root cause</p>
							<p class="mt-2 text-lg leading-7 font-medium break-words text-ink">
								{diagnosis.rootCause.statement}
							</p>
							<div class="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
								<span class="text-xs font-medium text-ink-muted tabular-nums"
									>Confidence {Math.round(diagnosis.rootCause.confidence * 100)}%</span
								>
								{#if diagnosis.evidence.length > 0}
									<span class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-muted">
										Exhibits
										{#each diagnosis.evidence as evidence, index (evidence)}
											<a
												href={`#exhibit-${index + 1}`}
												class="inline-flex min-h-11 items-center rounded-full bg-accent/10 px-2 font-mono text-[11px] font-medium text-accent hover:bg-accent/15 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:min-h-8"
												>{exhibitId(index)}</a
											>
										{/each}
									</span>
								{/if}
							</div>
						</div>
					{/if}
					<div class={diagnosis.rootCause ? 'mt-6' : ''}>
						<h3 class="text-sm font-semibold text-ink">What happened</h3>
						<p class="mt-2 text-base leading-7 break-words text-ink-muted">{diagnosis.summary}</p>
					</div>
				</CardContent>
			</Card>

			{#if diagnosis.suggestedFix}
				<Card class="min-w-0 overflow-hidden">
					<CardHeader><CardTitle>Recommended next action</CardTitle></CardHeader>
					<CardContent class="min-w-0">
						<p class="text-sm break-words text-ink">{diagnosis.suggestedFix.description}</p>
						<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
							{#each diagnosis.suggestedFix.steps as step (step)}<li class="break-words">
									{step}
								</li>{/each}
						</ol>
						{#if diagnosis.suggestedFix.patch}
							<div class="mt-4 flex justify-end">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onclick={() => copyText(diagnosis.suggestedFix?.patch ?? '', 'Patch copied.')}
								>
									<Clipboard class="size-3.5" aria-hidden="true" />Copy patch
								</Button>
							</div>
							<pre
								translate="no"
								class="mt-2 max-w-full overflow-x-auto rounded-lg border border-rule bg-surface-raised p-4 text-xs leading-5">{diagnosis
									.suggestedFix.patch}</pre>
						{/if}
						<p class="mt-4 text-xs text-warning">Suggestion only; nothing was applied to GitHub.</p>
					</CardContent>
				</Card>
			{/if}

			<Card class="min-w-0 overflow-hidden">
				<CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
				<CardContent class="min-w-0 space-y-5">
					{#each diagnosis.evidence as evidence, index (index)}
						{@const sourceUrl = githubFileUrl(evidence)}
						{@const repository =
							'repositoryId' in evidence ? repositoryFor(evidence.repositoryId) : null}
						<article
							id={`exhibit-${index + 1}`}
							class="max-w-full min-w-0 scroll-mt-24 overflow-hidden rounded-lg border border-rule"
						>
							<div
								class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5"
							>
								<span
									class="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium text-accent"
									>{exhibitId(index)}</span
								>
								{#if sourceUrl && 'path' in evidence}
									<a
										href={sourceUrl}
										target="_blank"
										rel="noreferrer"
										translate="no"
										class="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs break-all text-accent hover:text-accent-hover hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
									>
										<span
											>{repository?.fullName}/{evidence.path}:{evidence.lineStart}-{evidence.lineEnd}</span
										>
										<ExternalLink aria-hidden="true" class="size-3.5 shrink-0" />
									</a>
								{:else}
									<span
										translate="no"
										class="min-w-0 flex-1 font-mono text-xs break-all text-ink-muted"
									>
										{'path' in evidence
											? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
											: 'command' in evidence
												? evidence.command
												: evidence.operation}
									</span>
								{/if}
							</div>
							<pre
								translate="no"
								class="max-w-full overflow-x-auto bg-surface-raised px-4 py-3 text-xs leading-5 text-ink-muted">{evidence.excerpt}</pre>
							<p
								class="border-t border-rule px-4 py-3 text-sm leading-6 break-words text-ink-muted"
							>
								{evidence.explanation}
							</p>
						</article>
					{/each}
					{#if !diagnosis.evidence.length}<p class="text-sm text-ink-faint">
							No evidence passed validation.
						</p>{/if}
				</CardContent>
			</Card>
		{/if}
	</div>

	<aside class="min-w-0 space-y-5">
		{#if diagnosis && runId}
			<Card>
				<CardHeader><CardTitle>Investigation outcome</CardTitle></CardHeader>
				<CardContent>
					<form method="POST" action="?/feedback" use:enhance={feedbackEnhance}>
						<input type="hidden" name="runId" value={runId} />
						<fieldset>
							<legend class="text-sm font-medium text-ink">Was this diagnosis useful?</legend>
							<div class="mt-3 grid grid-cols-2 gap-2">
								{#each feedbackOptions as option (option.value)}
									<label
										class="flex min-h-11 cursor-pointer items-center rounded-lg border px-3 py-2 text-xs font-medium transition-[border-color,background-color,color] {verdict ===
										option.value
											? 'border-accent bg-accent-soft text-accent-hover'
											: 'border-rule-strong bg-surface text-ink-muted hover:bg-surface-raised'}"
									>
										<input
											class="sr-only"
											type="radio"
											name="verdict"
											value={option.value}
											bind:group={verdict}
											required
										/>
										{option.label}
									</label>
								{/each}
							</div>
						</fieldset>
						<label for="diagnosis-note" class="mt-4 block text-sm font-medium text-ink"
							>Correction or operator note</label
						>
						<Textarea
							id="diagnosis-note"
							name="note"
							class="mt-1.5 min-h-24"
							placeholder="Add what actually happened or what you tried…"
							autocomplete="off"
							maxlength={2000}
							required={verdict === 'incorrect'}
							bind:value={note}
						/>
						<p class="mt-1.5 text-xs text-ink-faint">
							Required when marking the diagnosis incorrect.
						</p>
						{#if savedFeedback}
							<p class="mt-3 text-xs text-ink-faint">
								Saved as {feedbackOptions
									.find(({ value }) => value === savedFeedback?.verdict)
									?.label.toLowerCase()}.
							</p>
						{/if}
						{#if feedbackError}<div class="mt-3">
								<InlineAlert tone="danger">{feedbackError}</InlineAlert>
							</div>{/if}
						<p aria-live="polite" class="mt-3 text-xs leading-5 text-success">{feedbackMessage}</p>
						<Button type="submit" class="mt-3 w-full" disabled={feedbackPending || !verdict}
							>{feedbackPending ? 'Saving outcome…' : 'Save outcome'}</Button
						>
					</form>

					<div class="mt-5 border-t border-rule pt-5">
						{#if resolvedAt}
							<p class="text-sm font-medium text-success">Incident resolved</p>
							<p class="mt-1 text-xs text-ink-faint">{formatDateTime(resolvedAt)}</p>
						{:else}
							<p class="text-sm font-medium text-ink">Resolution status</p>
							<p class="mt-1 text-xs leading-5 text-ink-faint">Still being investigated.</p>
						{/if}
						<form method="POST" action="?/resolution" class="mt-3" use:enhance={resolutionEnhance}>
							<input type="hidden" name="state" value={resolvedAt ? 'investigating' : 'resolved'} />
							<Button
								type="submit"
								variant={resolvedAt ? 'outline' : 'default'}
								class="w-full"
								disabled={resolutionPending}
							>
								{resolutionPending
									? 'Updating incident…'
									: resolvedAt
										? 'Reopen incident'
										: 'Mark incident resolved'}
							</Button>
						</form>
						{#if resolutionError}<div class="mt-3">
								<InlineAlert tone="danger">{resolutionError}</InlineAlert>
							</div>{/if}
						<p aria-live="polite" class="mt-3 text-xs text-success">{resolutionMessage}</p>
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if diagnosis}
			<Card>
				<CardHeader><CardTitle>Limitations & checks</CardTitle></CardHeader>
				<CardContent class="space-y-3 text-sm text-ink-muted">
					{#each diagnosis.checksRun as check, index (`${check.name}-${index}`)}
						<p class="break-words">
							<Badge tone={statusTone[check.status] ?? 'neutral'}>{check.status}</Badge><span
								class="ml-1">{check.name}: {check.summary}</span
							>
						</p>
					{/each}
					{#each diagnosis.limitations as limitation, index (`${limitation}-${index}`)}<p
							class="break-words"
						>
							• {limitation}
						</p>{/each}
					{#if !diagnosis.limitations.length && !diagnosis.checksRun.length}<p>
							No reported limitations.
						</p>{/if}
				</CardContent>
			</Card>
		{/if}
	</aside>
</div>
