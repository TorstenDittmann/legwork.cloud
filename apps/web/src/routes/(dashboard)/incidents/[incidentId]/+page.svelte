<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import SeverityMark from '$lib/components/ui/severity-mark.svelte';
	import { statusTone } from '$lib/components/ui/status';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';
	import DiagnosisReport from './diagnosis-report.svelte';
	import IncidentLive from './incident-live.svelte';
	import InvestigationRecord from './investigation-record.svelte';

	let { data }: PageProps = $props();

	const selected = $derived(data.selectedRun);
	// Runs arrive newest first, so the last entry is attempt 1.
	const attemptNumber = (runId: string) =>
		data.runs.length - data.runs.findIndex(({ id }) => id === runId);
	const tone = (status: string) => statusTone[status] ?? 'neutral';
	const tokensFor = (run: { inputTokens: number; outputTokens: number }) =>
		(run.inputTokens + run.outputTokens).toLocaleString();
</script>

{#if selected}
	{@const attempt = attemptNumber(selected.run.id)}
	<div class="mb-6">
		<InlineAlert tone="warning">
			<div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
				<span>
					Viewing attempt {attempt} from {formatDateTime(selected.run.createdAt)}. A newer run
					exists for this incident.
				</span>
				<Button href="/incidents/{data.snapshot.incident.id}" variant="outline" size="sm">
					<ArrowLeft aria-hidden="true" class="size-4" />
					Back to live view
				</Button>
			</div>
		</InlineAlert>
	</div>
	<header>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			<SeverityMark severity={data.snapshot.incident.severity} />
			<Badge tone={tone(selected.run.status)}>{selected.run.status}</Badge>
			<span class="text-xs text-ink-faint">{data.snapshot.serviceName}</span>
		</div>
		<h1
			class="mt-4 font-display text-3xl leading-tight font-semibold tracking-[-0.01em] text-ink sm:text-4xl"
		>
			{data.snapshot.incident.title}
		</h1>
	</header>
	<DiagnosisReport
		diagnosis={selected.diagnosis}
		runId={selected.run.id}
		feedback={selected.feedback}
		resolvedAt={data.snapshot.incident.resolvedAt}
		revisions={selected.run.resolvedRevisions ?? []}
		repositories={selected.repositories}
	/>
	<InvestigationRecord steps={selected.steps} startedAt={selected.run.createdAt} collapsed />
{:else}
	{#key data.snapshot.incident.id}
		<IncidentLive initial={data.snapshot} />
	{/key}
{/if}

{#if data.runs.length > 1}
	<section class="mt-10">
		<SectionHeader>
			{#snippet meta()}{data.runs.length} attempts{/snippet}
			Run history
		</SectionHeader>
		<ul class="divide-y divide-rule overflow-hidden rounded-xl border border-rule">
			{#each data.runs as run, index (run.id)}
				{@const current = index === 0}
				{@const active = selected ? run.id === selected.run.id : current}
				<li
					class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 {active
						? 'bg-accent-soft'
						: ''}"
				>
					<Badge tone={tone(run.status)}>{run.status}</Badge>
					<a
						href={current
							? `/incidents/${data.snapshot.incident.id}`
							: `/incidents/${data.snapshot.incident.id}?run=${run.id}`}
						class="text-sm font-medium text-ink hover:text-accent"
					>
						Attempt {data.runs.length - index}
						{#if current}<span class="text-ink-faint">· Current</span>{/if}
					</a>
					{#if run.failureCode}
						<span class="font-mono text-xs text-danger">{run.failureCode}</span>
					{/if}
					<span class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
						<span class="tabular-nums">{tokensFor(run)} tokens</span>
						<span class="tabular-nums">{formatDateTime(run.createdAt)}</span>
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.callbacks.length > 0}
	<section class="mt-10">
		<SectionHeader>Callback deliveries</SectionHeader>
		<ul class="divide-y divide-rule overflow-hidden rounded-xl border border-rule">
			{#each data.callbacks as delivery (delivery.id)}
				<li class="px-4 py-3">
					<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
						<Badge tone={tone(delivery.status)}>{delivery.status.replaceAll('_', ' ')}</Badge>
						<span class="font-mono text-xs text-ink">{delivery.event}</span>
						{#if delivery.responseStatus}
							<span class="text-xs text-ink-muted tabular-nums">HTTP {delivery.responseStatus}</span
							>
						{/if}
						{#if delivery.attempt > 0}
							<span class="text-xs text-ink-faint">attempt {delivery.attempt}</span>
						{/if}
						<span class="ml-auto text-xs text-ink-faint tabular-nums">
							{#if delivery.deliveredAt}
								Delivered {formatDateTime(delivery.deliveredAt)}
							{:else if delivery.nextAttemptAt}
								Retries {formatDateTime(delivery.nextAttemptAt)}
							{:else}
								{formatDateTime(delivery.createdAt)}
							{/if}
						</span>
					</div>
					{#if delivery.error}
						<p class="mt-1.5 truncate text-xs text-danger">{delivery.error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
