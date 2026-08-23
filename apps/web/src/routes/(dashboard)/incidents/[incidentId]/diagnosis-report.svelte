<script lang="ts">
	import { Clipboard, Share2 } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import { statusTone } from '$lib/components/ui/status';
	import type { Diagnosis } from '@legwork/contracts';

	const exhibitId = (index: number) => `E-${String(index + 1).padStart(2, '0')}`;

	let { diagnosis }: { diagnosis: Diagnosis | null } = $props();
	let feedback = $state('');

	function reportText(value: Diagnosis) {
		const lines = [
			value.status === 'diagnosed' ? 'Diagnosis' : 'Inconclusive investigation',
			value.summary
		];
		if (value.rootCause) {
			lines.push(
				'',
				`Root cause (${Math.round(value.rootCause.confidence * 100)}% confidence)`,
				value.rootCause.statement
			);
		}
		if (value.suggestedFix) {
			lines.push('', 'Suggested fix', value.suggestedFix.description);
			lines.push(...value.suggestedFix.steps.map((step, index) => `${index + 1}. ${step}`));
		}
		return lines.join('\n');
	}

	async function copyText(value: string, successMessage: string) {
		try {
			await navigator.clipboard.writeText(value);
			feedback = successMessage;
		} catch {
			feedback = 'Copy failed. Select the report text and copy it manually.';
		}
	}

	async function shareReport(value: Diagnosis) {
		const text = reportText(value);
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Legwork diagnosis', text, url: window.location.href });
				feedback = 'Report shared.';
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				await copyText(`${text}\n\n${window.location.href}`, 'Share link copied.');
			}
			return;
		}
		await copyText(`${text}\n\n${window.location.href}`, 'Share link copied.');
	}
</script>

<div class="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
	<div class="space-y-5">
		{#if diagnosis}
			<Card class="border-t-2 border-t-accent">
				<CardHeader class="flex flex-wrap items-center justify-between gap-3">
					<CardTitle class="text-2xl"
						>{diagnosis.status === 'diagnosed' ? 'Diagnosis' : 'Inconclusive'}</CardTitle
					>
					<div class="flex flex-wrap gap-2">
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
				<CardContent>
					<p aria-live="polite" class="mb-3 min-h-5 text-xs text-success">{feedback}</p>
					<p class="text-base leading-7 text-ink-muted">{diagnosis.summary}</p>
					{#if diagnosis.rootCause}
						<div class="mt-6 rounded-lg border border-accent/20 bg-accent-soft px-5 py-4">
							<p class="text-base leading-7 text-ink">
								{diagnosis.rootCause.statement}
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
								<span class="text-xs font-medium text-ink-muted">
									Confidence {Math.round(diagnosis.rootCause.confidence * 100)}%
								</span>
								{#if diagnosis.evidence.length > 0}
									<span class="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
										Exhibits
										{#each diagnosis.evidence, index}
											<a
												href={`#exhibit-${index + 1}`}
												class="inline-flex min-h-11 items-center rounded-full bg-accent/10 px-2 font-mono text-[11px] font-medium text-accent hover:bg-accent/15 sm:min-h-8"
											>
												{exhibitId(index)}
											</a>
										{/each}
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Evidence</CardTitle>
				</CardHeader>
				<CardContent class="space-y-5">
					{#each diagnosis.evidence as evidence, index (index)}
						<article
							id={`exhibit-${index + 1}`}
							class="scroll-mt-24 overflow-hidden rounded-lg border border-rule"
						>
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5"
							>
								<span
									class="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium text-accent"
								>
									{exhibitId(index)}
								</span>
								<span translate="no" class="min-w-0 truncate font-mono text-xs text-ink-muted">
									{'path' in evidence
										? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
										: 'command' in evidence
											? evidence.command
											: evidence.operation}
								</span>
							</div>
							<pre
								translate="no"
								class="overflow-x-auto bg-surface-raised px-4 py-3 text-xs leading-5 text-ink-muted">{evidence.excerpt}</pre>
							<p class="border-t border-rule px-4 py-3 text-sm leading-6 text-ink-muted">
								{evidence.explanation}
							</p>
						</article>
					{/each}
					{#if !diagnosis.evidence.length}
						<p class="text-sm text-ink-faint">No evidence passed validation.</p>
					{/if}
				</CardContent>
			</Card>
			{#if diagnosis.suggestedFix}
				<Card>
					<CardHeader>
						<CardTitle>Suggested fix</CardTitle>
					</CardHeader>
					<CardContent>
						<p class="text-sm text-ink">{diagnosis.suggestedFix.description}</p>
						<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
							{#each diagnosis.suggestedFix.steps as step (step)}
								<li>{step}</li>
							{/each}
						</ol>
						{#if diagnosis.suggestedFix.patch}
							<div class="mt-4 flex justify-end">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onclick={() => copyText(diagnosis.suggestedFix?.patch ?? '', 'Patch copied.')}
								>
									<Clipboard class="size-3.5" aria-hidden="true" />
									Copy patch
								</Button>
							</div>
							<pre
								translate="no"
								class="mt-2 overflow-x-auto rounded-lg border border-rule bg-surface-raised p-4 text-xs leading-5">{diagnosis
									.suggestedFix.patch}</pre>
						{/if}
						<p class="mt-4 text-xs text-warning">Suggestion only; nothing was applied to GitHub.</p>
					</CardContent>
				</Card>
			{/if}
		{/if}
	</div>
	<aside class="space-y-5">
		{#if diagnosis}
			<Card>
				<CardHeader>
					<CardTitle>Limitations & checks</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3 text-sm text-ink-muted">
					{#each diagnosis.checksRun as check, index (`${check.name}-${index}`)}
						<p>
							<Badge tone={statusTone[check.status] ?? 'neutral'}>{check.status}</Badge>
							<span class="ml-1">
								{check.name}: {check.summary}
							</span>
						</p>
					{/each}
					{#each diagnosis.limitations as limitation, index (`${limitation}-${index}`)}
						<p>• {limitation}</p>
					{/each}
					{#if !diagnosis.limitations.length && !diagnosis.checksRun.length}
						<p>No reported limitations.</p>
					{/if}
				</CardContent>
			</Card>
		{/if}
	</aside>
</div>
