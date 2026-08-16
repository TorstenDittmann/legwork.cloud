<script lang="ts">
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
	import { statusTone } from '$lib/components/ui/status';
	import { formatDuration } from '$lib/utils';
	import IncidentLoading from './incident-loading.svelte';

	type Data = {
		incident: {
			id: string;
			title: string;
			severity: string;
			occurredAt: string;
			payload: { description?: string; environment?: string };
		};
		serviceName: string;
		currentRun: {
			id: string;
			status: string;
			failureCode?: string;
			resolvedRevisions?: Array<{ repositoryId: string; sha: string }>;
			startedAt?: string;
			completedAt?: string;
		} | null;
		steps: Array<{
			id: string;
			summary: string;
			detail?: string;
			sequence: number;
			kind: string;
			toolName?: string;
			durationMs?: number;
			createdAt: string;
		}>;
		diagnosis: null | {
			status: string;
			summary: string;
			rootCause: null | { statement: string; confidence: number };
			evidence: Array<{
				repositoryId: string;
				path?: string;
				lineStart?: number;
				lineEnd?: number;
				command?: string;
				excerpt: string;
				explanation: string;
			}>;
			suggestedFix: null | { description: string; steps: string[]; patch?: string };
			checksRun: Array<{ name: string; status: string; summary: string }>;
			limitations: string[];
		};
	};

	const exhibitId = (index: number) => `E-${String(index + 1).padStart(2, '0')}`;
	const stages = ['Queued', 'Provisioning', 'Repositories', 'Analyzing', 'Synthesis', 'Complete'];

	let { incidentId }: { incidentId: string } = $props();

	let data = $state<Data | null>(null);
	let error = $state('');
	let connected = $state(false);
	let retrying = $state(false);
	let retryError = $state('');
	let showJump = $state(false);
	let transcriptEl = $state<HTMLDivElement | null>(null);
	let followTranscript = true;
	let previousStepCount = 0;
	let lastStepsLength: number | undefined;

	$effect(() => {
		const source = new EventSource(`/api/incidents/${incidentId}/events`);
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
		return () => {
			source.removeEventListener('incident', receive as EventListener);
			source.removeEventListener('incident-error', receiveError as EventListener);
			source.close();
		};
	});

	$effect(() => {
		const length = data?.steps.length;
		if (length === lastStepsLength) return;
		lastStepsLength = length;
		const transcript = transcriptEl;
		if (!transcript || !length || !followTranscript) return;
		transcript.scrollTo({
			top: transcript.scrollHeight,
			behavior:
				previousStepCount === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'auto'
					: 'smooth'
		});
		previousStepCount = length;
	});

	async function retry() {
		if (!data?.currentRun || retrying) return;
		retrying = true;
		retryError = '';
		try {
			const response = await fetch(`/api/incidents/${incidentId}/retry`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ runId: data.currentRun.id })
			});
			const payload = (await response.json()) as {
				runId?: string;
				detail?: string;
				title?: string;
			};
			if (!response.ok || !payload.runId)
				throw new Error(payload.detail ?? payload.title ?? 'Unable to retry analysis');
			const retryRunId = payload.runId;
			if (data?.currentRun)
				data = {
					...data,
					currentRun: { ...data.currentRun, id: retryRunId, status: 'queued' },
					steps: [],
					diagnosis: null
				};
			retrying = false;
		} catch (retryFailure) {
			retryError =
				retryFailure instanceof Error ? retryFailure.message : 'Unable to retry analysis';
			retrying = false;
		}
	}
</script>

{#if error}
	<p class="text-danger">{error}</p>
{:else if !data}
	<IncidentLoading />
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
		<a
			href="/incidents"
			class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase hover:text-accent"
		>
			← Incident Ledger
		</a>
		<div class="mt-5 flex flex-wrap items-start justify-between gap-5">
			<div class="max-w-4xl min-w-0">
				<div class="mb-3 flex flex-wrap items-center gap-3">
					<SeverityMark severity={data.incident.severity} />
					<StatusMark status={data.currentRun?.status ?? 'queued'} />
					<span
						aria-live="polite"
						class="font-mono text-[10px] tracking-[0.08em] uppercase {connected
							? 'text-live'
							: 'text-warning'}"
					>
						{connected ? '● Live' : '○ Reconnecting'}
					</span>
				</div>
				<h1
					class="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.02em] text-pretty md:text-5xl"
				>
					{data.incident.title}
				</h1>
			</div>
			{#if terminal}
				<Button variant="outline" onclick={retry} disabled={retrying}>
					{retrying ? 'Queuing Retry…' : 'Retry Analysis'}
				</Button>
			{/if}
		</div>
		<RecordFieldGrid class="mt-6 lg:grid-cols-5">
			<RecordField label="Service">{data.serviceName}</RecordField>
			<RecordField label="Environment">
				{data.incident.payload.environment ?? 'unknown'}
			</RecordField>
			<RecordField label="Occurred">
				<time>
					{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
						new Date(data.incident.occurredAt)
					)}
				</time>
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
				{#snippet meta()}Stage {activeStage + 1} / {stages.length}{/snippet}
				Run Progress
			</SectionHeader>
			<ol
				class="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6"
			>
				{#each stages as stage, index (stage)}
					<li class="bg-surface px-3 py-3.5 {index <= activeStage ? 'text-ink' : 'text-ink-faint'}">
						<span
							aria-hidden="true"
							class="mb-2 block h-0.5 {index < activeStage
								? 'bg-accent'
								: index === activeStage
									? 'bg-live'
									: 'bg-rule'}"
						></span>
						<span class="font-mono text-[9px] tracking-[0.08em] uppercase">{stage}</span>
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
							<div class="mt-6 rounded-[3px] border-l-2 border-accent bg-surface-raised px-5 py-4">
								<p class="text-base leading-7 text-ink">
									{diagnosis.rootCause.statement}
								</p>
								<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
									<span class="font-mono text-[10px] text-ink-faint">
										Confidence {Math.round(diagnosis.rootCause.confidence * 100)}%
									</span>
									{#if diagnosis.evidence.length > 0}
										<span
											class="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-faint"
										>
											Exhibits
											{#each diagnosis.evidence, index}
												<a
													href={`#exhibit-${index + 1}`}
													class="rounded-[2px] border border-accent/35 bg-accent/5 px-1 py-px text-accent hover:bg-accent/10"
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
								class="scroll-mt-24 overflow-hidden rounded-[3px] border border-rule"
							>
								<div
									class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-2.5"
								>
									<span class="font-mono text-[10px] font-medium text-accent">
										{exhibitId(index)}
									</span>
									<span
										translate="no"
										class="min-w-0 truncate font-mono text-[10px] text-ink-muted"
									>
										{evidence.path
											? `${evidence.path}:${evidence.lineStart}-${evidence.lineEnd}`
											: evidence.command}
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
									class="mt-4 overflow-x-auto rounded-[3px] border border-rule bg-surface-raised p-4 text-xs leading-5">{diagnosis
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
		<div class="mb-3 flex flex-wrap items-end justify-between gap-2">
			<div>
				<h2
					id="agent-activity-heading"
					class="font-display text-lg font-semibold tracking-[-0.01em]"
				>
					Investigation Record
				</h2>
				<p class="mt-0.5 text-xs text-ink-faint">
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
						Jump to Latest
					</Button>
				{/if}
				<span
					aria-live="polite"
					class={connected
						? 'font-mono text-[10px] text-live'
						: 'font-mono text-[10px] text-warning'}
				>
					{data.steps.length} events · {connected ? 'live' : 'reconnecting'}
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
			class="h-[38rem] overflow-y-auto overscroll-contain scroll-smooth rounded-[4px] border border-rule bg-surface px-3 shadow-[0_1px_2px_rgba(23,26,32,0.04)]"
		>
			{#each data.steps as step (step.id)}
				<div
					class="agent-log-entry grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 border-b border-rule py-3 last:border-0 md:grid-cols-[2rem_8rem_minmax(0,1fr)_auto]"
				>
					<span class="pt-0.5 text-right font-mono text-[10px] text-ink-faint tabular-nums">
						{step.sequence}
					</span>
					<div class="flex min-w-0 items-center gap-1.5 pt-0.5">
						<span class="truncate font-mono text-[10px] tracking-[0.08em] text-accent uppercase">
							{step.kind.replaceAll('_', ' ')}
						</span>
					</div>
					<div class="min-w-0">
						<p class="text-sm leading-5 text-ink-muted">{step.summary}</p>
						{#if step.detail}
							<details class="group mt-1">
								<summary
									class="cursor-pointer list-none font-mono text-[10px] text-ink-faint hover:text-ink-muted"
								>
									<span class="group-open:hidden">▸ show payload</span>
									<span class="hidden group-open:inline">▾ hide payload</span>
									<span class="ml-2 opacity-60">{step.detail.length} chars</span>
								</summary>
								<pre
									translate="no"
									class="mt-2 border-l border-rule-strong pl-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-ink-muted">{step.detail}</pre>
							</details>
						{/if}
					</div>
					<div
						class="col-start-2 flex items-center gap-2 pt-0.5 font-mono text-[10px] text-ink-faint md:col-start-auto"
					>
						{#if step.toolName}<span>{step.toolName}</span>{/if}
						{#if step.durationMs !== undefined}<span>{step.durationMs}ms</span>{/if}
						<span>{new Date(step.createdAt).toLocaleTimeString()}</span>
					</div>
				</div>
			{/each}
			{#if !data.steps.length}
				<p class="py-6 text-sm text-ink-faint">Waiting for analysis…</p>
			{/if}
		</div>
	</section>
{/if}
