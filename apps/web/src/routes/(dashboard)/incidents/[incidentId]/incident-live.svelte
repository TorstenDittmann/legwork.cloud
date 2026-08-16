<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Check, ChevronRight } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import RecordField from '$lib/components/ui/record-field.svelte';
	import RecordFieldGrid from '$lib/components/ui/record-field-grid.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import SeverityMark from '$lib/components/ui/severity-mark.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import { statusTone, type BadgeTone } from '$lib/components/ui/status';
	import { formatDateTime, formatDuration } from '$lib/utils';
	import { foldSteps, type FeedEntry } from '$lib/incident-feed';
	import type { Diagnosis } from '@legwork/contracts';

	// Matches the SSE `incident` event payload. The server-load snapshot feeds the same
	// five-field shape, but arrives via devalue: its date columns are real `Date`s (SSE
	// frames send ISO strings) and its nullable drizzle columns are `null` rather than
	// absent — hence `string | Date` and `| null` below.
	type Data = {
		incident: {
			id: string;
			title: string;
			severity: string;
			occurredAt: string | Date;
			payload: { description?: string; environment?: string };
		};
		serviceName: string;
		currentRun: {
			id: string;
			status: string;
			failureCode?: string | null;
			resolvedRevisions?: Array<{ repositoryId: string; sha: string }> | null;
			startedAt?: string | Date | null;
			completedAt?: string | Date | null;
		} | null;
		steps: Array<{
			id: string;
			summary: string;
			detail?: string | null;
			sequence: number;
			kind: string;
			toolName?: string | null;
			durationMs?: number | null;
			correlationId?: string | null;
			createdAt: string | Date;
		}>;
		diagnosis: Diagnosis | null;
	};

	const exhibitId = (index: number) => `E-${String(index + 1).padStart(2, '0')}`;
	const stages = ['Queued', 'Provisioning', 'Repositories', 'Analyzing', 'Synthesis', 'Complete'];
	const warningKinds = new Set([
		'node_retried',
		'tool_batch_rejected',
		'sandbox_replaced',
		'sandbox_cleanup_warning'
	]);

	const humanizeKind = (kind: string) =>
		kind
			.replace(/_(started|completed|failed)$/, '')
			.replaceAll('_', ' ')
			.replace(/\b\w/g, (letter) => letter.toUpperCase());

	const entryLabel = (entry: FeedEntry) => {
		if (entry.toolName) return humanizeKind(entry.toolName);
		if (entry.kind === 'node_started' && entry.detail) return humanizeKind(entry.detail);
		if (entry.state === 'failed') return 'Failed';
		if (entry.state === 'running') return 'In progress';
		if (entry.kind.startsWith('sandbox_')) return 'Sandbox';
		if (entry.kind === 'assistant_message' || entry.kind === 'analysis') return 'Investigation';
		if (entry.kind === 'reasoning') return 'Planning';
		if (entry.kind === 'completed') return 'Complete';
		if (entry.kind === 'diagnosis_response') return 'Finding';
		return humanizeKind(entry.kind);
	};

	const entryTone = (entry: FeedEntry): BadgeTone => {
		if (entry.state === 'failed') return 'danger';
		if (entry.state === 'running') return 'live';
		if (warningKinds.has(entry.kind)) return 'warning';
		if (entry.kind === 'completed' || entry.kind === 'diagnosis_response') return 'success';
		if (entry.kind === 'synthesis' || entry.kind === 'validation') return 'accent';
		return 'neutral';
	};

	const entryDot = (entry: FeedEntry) => {
		const tone = entryTone(entry);
		if (tone === 'danger') return 'border-danger bg-danger';
		if (tone === 'warning') return 'border-warning bg-warning';
		if (tone === 'success' || tone === 'accent') return 'border-accent bg-accent';
		return 'border-rule-strong bg-rule-strong';
	};

	const formatTrailTime = (value: string | Date, startedAt: string | Date) => {
		const elapsed = Math.max(0, new Date(value).getTime() - new Date(startedAt).getTime());
		const totalSeconds = Math.floor(elapsed / 1_000);
		const hours = Math.floor(totalSeconds / 3_600);
		const minutes = Math.floor((totalSeconds % 3_600) / 60);
		const seconds = totalSeconds % 60;
		return hours
			? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
			: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	};

	const formatEntryDuration = (milliseconds: number) =>
		milliseconds < 1_000
			? `${Math.max(0, Math.round(milliseconds))}ms`
			: formatDuration(milliseconds);

	type DetailSection = { label: 'Details' | 'Input' | 'Result' | 'Error'; value: string };

	const normalizeActivityText = (value: string) =>
		value.trim().toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ');

	const uniqueDetail = (
		value: string | null | undefined,
		repeats: Array<string | null | undefined>
	) => {
		const detail = value?.trim();
		if (!detail) return null;
		const normalized = normalizeActivityText(detail);
		return repeats.some((repeat) => repeat && normalizeActivityText(repeat) === normalized)
			? null
			: detail;
	};

	const entrySummary = (entry: FeedEntry) => {
		if (entry.kind !== 'node_started' || !entry.detail) return entry.summary;
		const state =
			entry.state === 'running' ? 'started' : entry.state === 'failed' ? 'failed' : 'completed';
		return normalizeActivityText(entry.summary) ===
			normalizeActivityText(`${entry.detail} ${state}`)
			? null
			: entry.summary;
	};

	const entryDetailSections = (entry: FeedEntry): DetailSection[] => {
		// Instrumented graph nodes store their name as both input and result. Only retain
		// an actual failure or a future result that contains distinct information.
		if (entry.kind === 'node_started') {
			const result = uniqueDetail(entry.resultDetail, [
				entry.detail,
				entry.summary,
				entry.startSummary
			]);
			return result
				? [{ label: entry.state === 'failed' ? 'Error' : 'Result', value: result }]
				: [];
		}

		const input = uniqueDetail(entry.detail, [
			entry.summary,
			entry.startSummary,
			entryLabel(entry)
		]);
		const result = uniqueDetail(entry.resultDetail, [
			entry.summary,
			entry.startSummary,
			entryLabel(entry),
			input
		]);
		const sections: DetailSection[] = [];
		if (input)
			sections.push({
				label:
					entry.state === 'failed' && !entry.resultDetail
						? 'Error'
						: entry.toolName
							? 'Input'
							: 'Details',
				value: input
			});
		if (result)
			sections.push({ label: entry.state === 'failed' ? 'Error' : 'Result', value: result });
		return sections;
	};

	let { initial }: { initial: Data } = $props();

	// Intentional one-time seed: the {#key} on incident id in +page.svelte remounts this
	// component when navigating between incidents, so `initial` never changes in place.
	// svelte-ignore state_referenced_locally
	let data = $state(initial);
	let error = $state('');
	let connected = $state(false);
	let retrying = $state(false);
	let retryError = $state('');
	let showJump = $state(false);
	let showInternal = $state(false);
	let transcriptEl = $state<HTMLDivElement | null>(null);
	let followTranscript = true;
	let lastStepsLength: number | undefined;

	const entries = $derived(foldSteps(data.steps));
	const visibleEntries = $derived(showInternal ? entries : entries.filter((e) => !e.internal));
	const internalCount = $derived(entries.length - entries.filter((e) => !e.internal).length);
	const runningCount = $derived(entries.filter((e) => e.state === 'running').length);
	const activityStartedAt = $derived(
		data.currentRun?.startedAt ?? entries[0]?.createdAt ?? data.incident.occurredAt
	);

	// Drives the elapsed counter on in-flight entries; only ticks while something runs.
	let now = $state(Date.now());
	$effect(() => {
		if (!runningCount) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const elapsedMs = (startedAt: string | Date) => now - new Date(startedAt).getTime();

	$effect(() => {
		const source = new EventSource(`/api/incidents/${initial.incident.id}/events`);
		const receive = (event: MessageEvent<string>) => {
			data = JSON.parse(event.data) as Data;
			error = '';
			connected = true;
		};
		const receiveError = (event: MessageEvent<string>) => {
			const payload = JSON.parse(event.data) as { message?: string };
			error = payload.message ?? 'Unable to load incident';
			source.close();
		};
		source.addEventListener('incident', receive as EventListener);
		source.addEventListener('incident-error', receiveError as EventListener);
		source.onopen = () => (connected = true);
		source.onerror = () => (connected = false);
		return () => source.close();
	});

	$effect(() => {
		const length = visibleEntries.length;
		if (length === lastStepsLength) return;
		const previousLength = lastStepsLength;
		lastStepsLength = length;
		if (!transcriptEl || !length || !followTranscript) return;
		transcriptEl.scrollTo({
			top: transcriptEl.scrollHeight,
			behavior:
				!previousLength || window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'auto'
					: 'smooth'
		});
	});

	const retryEnhance: SubmitFunction = ({ cancel }) => {
		if (!data.currentRun || retrying) {
			cancel();
			return;
		}
		retrying = true;
		retryError = '';
		return async ({ result }) => {
			if (result.type === 'success') {
				const retryRunId = result.data?.runId ? String(result.data.runId) : null;
				if (retryRunId && data.currentRun)
					data = {
						...data,
						currentRun: { ...data.currentRun, id: retryRunId, status: 'queued' },
						steps: [],
						diagnosis: null
					};
				else retryError = 'Unable to retry analysis';
			} else if (result.type === 'failure') {
				retryError = String(
					result.data?.detail ?? result.data?.title ?? 'Unable to retry analysis'
				);
			} else if (result.type === 'error') {
				retryError =
					result.error instanceof Error ? result.error.message : 'Unable to retry analysis';
			}
			retrying = false;
		};
	};
</script>

{#if error}
	<p class="text-danger">{error}</p>
{:else}
	{@const diagnosis = data.diagnosis}
	{@const terminal =
		data.currentRun && ['completed', 'failed', 'inconclusive'].includes(data.currentRun.status)}
	{@const kinds = new Set(data.steps.map(({ kind }) => kind))}
	{@const activeStage = diagnosis
		? 5
		: kinds.has('synthesis')
			? 4
			: data.currentRun?.status === 'analyzing'
				? 3
				: kinds.has('sandbox_bootstrap')
					? 2
					: data.currentRun?.status === 'provisioning'
						? 1
						: 0}
	{@const analysisDuration =
		data.currentRun?.startedAt && data.currentRun.completedAt
			? formatDuration(
					new Date(data.currentRun.completedAt).getTime() -
						new Date(data.currentRun.startedAt).getTime()
				)
			: null}
	<header class="border-b border-rule pb-7">
		<a href="/incidents" class="text-sm font-medium text-ink-faint hover:text-accent">
			← Incident ledger
		</a>
		<div class="mt-5 flex flex-wrap items-start justify-between gap-5">
			<div class="max-w-4xl min-w-0">
				<div class="mb-3 flex flex-wrap items-center gap-2.5">
					<SeverityMark severity={data.incident.severity} />
					<StatusMark status={data.currentRun?.status ?? 'queued'} />
					<span
						aria-live="polite"
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium {connected
							? 'bg-live/10 text-live'
							: 'bg-warning/10 text-warning'}"
					>
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
						{connected ? 'Live' : 'Reconnecting'}
					</span>
				</div>
				<h1
					class="font-display text-3xl leading-[1.08] font-semibold tracking-[-0.01em] text-pretty md:text-[44px]"
				>
					{data.incident.title}
				</h1>
			</div>
			{#if terminal}
				<form method="POST" action="?/retry" use:enhance={retryEnhance}>
					<input type="hidden" name="runId" value={data.currentRun?.id} />
					<Button type="submit" variant="outline" disabled={retrying}>
						{retrying ? 'Queuing retry…' : 'Retry analysis'}
					</Button>
				</form>
			{/if}
		</div>
		<RecordFieldGrid class="mt-6 lg:grid-cols-5">
			<RecordField label="Service">{data.serviceName}</RecordField>
			<RecordField label="Environment">
				{data.incident.payload.environment ?? 'unknown'}
			</RecordField>
			<RecordField label="Occurred">
				<time>{formatDateTime(data.incident.occurredAt)}</time>
			</RecordField>
			{#if analysisDuration}
				<RecordField label="Analysis duration">{analysisDuration}</RecordField>
			{/if}
			{#each data.currentRun?.resolvedRevisions ?? [] as { repositoryId, sha } (repositoryId)}
				<RecordField label="Revision">
					<span translate="no" class="font-mono text-xs">{sha.slice(0, 12)}</span>
				</RecordField>
			{/each}
		</RecordFieldGrid>
	</header>
	{#if retryError}
		<div class="mt-4">
			<InlineAlert tone="danger">{retryError}</InlineAlert>
		</div>
	{/if}
	{#if data.incident.payload.description}
		<p class="mt-7 max-w-4xl text-base leading-7 text-ink-muted">
			{data.incident.payload.description}
		</p>
	{/if}
	{#if !diagnosis}
		<section class="mt-9">
			<SectionHeader>
				{#snippet meta()}Stage {activeStage + 1} of {stages.length}{/snippet}
				Run progress
			</SectionHeader>
			<ol class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Analysis stages">
				{#each stages as stage, index (stage)}
					<li
						class="flex items-center gap-2.5 rounded-lg border px-3.5 py-3 {index === activeStage
							? 'border-accent/30 bg-accent-soft text-accent-hover'
							: index < activeStage
								? 'border-rule bg-surface text-ink'
								: 'border-rule bg-surface/60 text-ink-faint'}"
					>
						{#if index < activeStage}
							<span
								aria-hidden="true"
								class="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-white"
							>
								<Check class="size-3" stroke-width={3} />
							</span>
						{:else if index === activeStage}
							<span aria-hidden="true" class="relative flex size-2.5 shrink-0">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60"
								></span>
								<span class="relative inline-flex size-2.5 rounded-full bg-live"></span>
							</span>
						{:else}
							<span aria-hidden="true" class="size-2.5 shrink-0 rounded-full bg-rule-strong"></span>
						{/if}
						<span class="truncate text-xs font-medium">{stage}</span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
	<div class="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
		<div class="space-y-5">
			{#if diagnosis}
				<Card class="border-t-2 border-t-accent">
					<CardHeader>
						<CardTitle class="text-2xl">
							{diagnosis.status === 'diagnosed' ? 'Diagnosis' : 'Inconclusive'}
						</CardTitle>
					</CardHeader>
					<CardContent>
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
													class="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-medium text-accent hover:bg-accent/15"
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
								<pre
									translate="no"
									class="mt-4 overflow-x-auto rounded-lg border border-rule bg-surface-raised p-4 text-xs leading-5">{diagnosis
										.suggestedFix.patch}</pre>
							{/if}
							<p class="mt-4 text-xs text-warning">
								Suggestion only; nothing was applied to GitHub.
							</p>
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
	<section class="mt-10" aria-labelledby="agent-activity-heading">
		<div class="mb-4 flex flex-wrap items-end justify-between gap-2">
			<div>
				<h2
					id="agent-activity-heading"
					class="font-display text-xl font-semibold tracking-[-0.005em]"
				>
					Investigation record
				</h2>
				<p class="mt-1 text-sm text-ink-faint">
					Sandbox lifecycle, prompts, model responses, tool calls, and tool output · chronological
				</p>
			</div>
			<div class="flex items-center gap-3">
				{#if showJump}
					<Button
						size="sm"
						variant="outline"
						onclick={() => {
							const el = transcriptEl;
							if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
							followTranscript = true;
							showJump = false;
						}}
					>
						Jump to latest
					</Button>
				{/if}
				{#if internalCount}
					<Button size="sm" variant="ghost" onclick={() => (showInternal = !showInternal)}>
						{showInternal ? 'Hide' : 'Show'} internal ({internalCount})
					</Button>
				{/if}
				<span
					aria-live="polite"
					class="inline-flex items-center gap-1.5 text-xs font-medium {connected
						? 'text-live'
						: 'text-warning'}"
				>
					<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
					{visibleEntries.length} events · {connected ? 'live' : 'reconnecting'}
				</span>
			</div>
		</div>
		<div
			bind:this={transcriptEl}
			onscroll={(event) => {
				const element = event.currentTarget;
				followTranscript = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
				showJump = !followTranscript;
			}}
			class="max-h-[38rem] overflow-y-auto overscroll-contain scroll-smooth rounded-2xl border border-rule bg-surface px-3 py-4 shadow-card sm:px-5"
		>
			{#snippet detailsTrigger()}
				<span
					class="inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap text-accent"
				>
					Details
					<ChevronRight
						aria-hidden="true"
						class="size-3 transition-transform group-open:rotate-90"
					/>
				</span>
			{/snippet}

			{#snippet activity(entry: FeedEntry, summary: string | null, expandable: boolean)}
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<Badge tone={entryTone(entry)} class="px-2 py-0 text-[11px]">
						{#if entry.state === 'running'}
							<span aria-hidden="true" class="relative flex size-1.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60"
								></span>
								<span class="relative inline-flex size-1.5 rounded-full bg-current"></span>
							</span>
						{/if}
						{entryLabel(entry)}
					</Badge>
					{#if entry.internal}
						<span class="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
							Internal
						</span>
					{/if}
					{#if summary}
						<p
							class="min-w-0 flex-1 text-[13px] leading-5 {entry.state === 'failed'
								? 'text-danger'
								: 'text-ink-muted'}"
						>
							{summary}
							{#if expandable}<span class="ml-1.5">{@render detailsTrigger()}</span>{/if}
						</p>
					{:else if expandable}
						{@render detailsTrigger()}
					{/if}
					{#if entry.state === 'running'}
						<span class="ml-auto font-mono text-[10px] text-live tabular-nums">
							{formatDuration(elapsedMs(entry.createdAt))}
						</span>
					{:else if entry.durationMs != null}
						<span class="ml-auto font-mono text-[10px] text-ink-faint tabular-nums">
							{formatEntryDuration(entry.durationMs)}
						</span>
					{/if}
				</div>
			{/snippet}

			<ol>
				{#each visibleEntries as entry, index (entry.id)}
					{@const summary = entrySummary(entry)}
					{@const detailSections = entryDetailSections(entry)}
					{@const expandable = detailSections.length > 0}
					<li
						class="agent-log-entry grid grid-cols-[2.75rem_1rem_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[3.75rem_1rem_minmax(0,1fr)] sm:gap-x-3"
					>
						<time
							datetime={new Date(entry.createdAt).toISOString()}
							title={formatDateTime(entry.createdAt)}
							class="pt-px text-right font-mono text-xs text-ink-faint tabular-nums"
						>
							{formatTrailTime(entry.createdAt, activityStartedAt)}
						</time>
						<span aria-hidden="true" class="relative flex justify-center">
							{#if index < visibleEntries.length - 1}
								<span class="absolute top-2 bottom-0 w-px bg-rule"></span>
							{/if}
							{#if entry.state === 'running'}
								<span class="relative mt-1 flex size-2.5">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60"
									></span>
									<span
										class="relative inline-flex size-2.5 rounded-full border-2 border-live bg-live"
									></span>
								</span>
							{:else}
								<span class={`relative mt-1 size-2.5 rounded-full border-2 ${entryDot(entry)}`}
								></span>
							{/if}
						</span>
						<div class={index < visibleEntries.length - 1 ? 'min-w-0 pb-4' : 'min-w-0'}>
							{#if expandable}
								<details class="group">
									<summary
										class="-mx-1.5 cursor-pointer list-none rounded-md px-1.5 py-0.5 transition-colors outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
									>
										{@render activity(entry, summary, true)}
									</summary>
									<div
										class="mt-2 space-y-2 overflow-hidden rounded-md border border-rule bg-surface-raised/60 p-2.5"
									>
										{#each detailSections as section (section.label)}
											<div>
												<p class="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
													{section.label}
												</p>
												<pre
													translate="no"
													class="mt-1 overflow-x-auto rounded-sm bg-surface px-2.5 py-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap text-ink-muted">{section.value}</pre>
											</div>
										{/each}
									</div>
								</details>
							{:else}
								{@render activity(entry, summary, false)}
							{/if}
						</div>
					</li>
				{/each}
			</ol>
			{#if !visibleEntries.length}
				<div class="grid min-h-36 place-items-center text-center">
					<div>
						<span aria-hidden="true" class="mx-auto mb-3 block size-2.5 rounded-full bg-rule-strong"
						></span>
						<p class="text-sm text-ink-faint">Waiting for analysis…</p>
					</div>
				</div>
			{/if}
		</div>
	</section>
{/if}
