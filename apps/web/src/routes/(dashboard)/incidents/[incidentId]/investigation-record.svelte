<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import type { BadgeTone } from '$lib/components/ui/status';
	import { formatDateTime, formatDuration } from '$lib/utils';
	import { foldSteps, type FeedEntry, type FeedStep } from '$lib/incident-feed';

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

	let {
		steps,
		startedAt,
		live = false,
		connected = false,
		collapsed = false
	}: {
		steps: FeedStep[];
		startedAt: string | Date;
		live?: boolean;
		connected?: boolean;
		collapsed?: boolean;
	} = $props();

	let showJump = $state(false);
	let showInternal = $state(false);
	let transcriptEl = $state<HTMLDivElement | null>(null);
	let followTranscript = true;
	let lastStepsLength: number | undefined;

	const entries = $derived(foldSteps(steps));
	const visibleEntries = $derived(showInternal ? entries : entries.filter((e) => !e.internal));
	const internalCount = $derived(entries.length - entries.filter((e) => !e.internal).length);
	const runningCount = $derived(entries.filter((e) => e.state === 'running').length);

	// Drives the elapsed counter on in-flight entries; only ticks while a live run is in flight.
	let now = $state(Date.now());
	$effect(() => {
		if (!live || !runningCount) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const elapsedMs = (from: string | Date) => now - new Date(from).getTime();

	// Live only: a static historical transcript reads from the top instead of following the tail.
	$effect(() => {
		if (!live) return;
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
</script>

<section class="mt-10" aria-labelledby="agent-activity-heading">
	<details open={!collapsed} class="group/record">
		<summary
			class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[border-color,background-color] outline-none hover:border-rule-strong hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
		>
			<div class="min-w-0">
				<h2
					id="agent-activity-heading"
					class="font-display text-xl font-semibold tracking-[-0.005em]"
				>
					Investigation record
				</h2>
				<p class="mt-1 text-sm text-ink-faint">
					{visibleEntries.length} events · sandbox, model, and tool audit trail
				</p>
			</div>
			<ChevronRight
				aria-hidden="true"
				class="size-5 shrink-0 text-ink-faint transition-transform group-open/record:rotate-90"
			/>
		</summary>
		<div class="mt-4">
			<div class="mb-3 flex flex-wrap items-center justify-end gap-3">
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
				{#if live}
					<span
						aria-live="polite"
						class="inline-flex items-center gap-1.5 text-xs font-medium {connected
							? 'text-live'
							: 'text-warning'}"
					>
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
						{visibleEntries.length} events · {connected ? 'live' : 'reconnecting'}
					</span>
				{:else}
					<span class="text-xs font-medium text-ink-faint">{visibleEntries.length} events</span>
				{/if}
			</div>
			<div
				bind:this={transcriptEl}
				onscroll={(event) => {
					const element = event.currentTarget;
					followTranscript = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
					showJump = !followTranscript;
				}}
				class="h-[38rem] overflow-y-auto overscroll-contain scroll-smooth rounded-2xl border border-rule bg-surface px-3 py-4 shadow-card sm:px-5"
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
								{formatTrailTime(entry.createdAt, startedAt)}
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
							<span
								aria-hidden="true"
								class="mx-auto mb-3 block size-2.5 rounded-full bg-rule-strong"
							></span>
							<p class="text-sm text-ink-faint">
								{live ? 'Waiting for analysis…' : 'No recorded activity.'}
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</details>
</section>
