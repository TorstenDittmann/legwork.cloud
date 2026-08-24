<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Check, Clipboard, ExternalLink } from '@lucide/svelte';
	import Button from '$lib/components/ui/button.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import RecordField from '$lib/components/ui/record-field.svelte';
	import RecordFieldGrid from '$lib/components/ui/record-field-grid.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import SeverityMark from '$lib/components/ui/severity-mark.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import { formatDateTime, formatDuration } from '$lib/utils';
	import type { Diagnosis } from '@legwork/contracts';
	import DiagnosisReport from './diagnosis-report.svelte';
	import IncidentDescription from './incident-description.svelte';
	import InvestigationRecord from './investigation-record.svelte';

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
			resolvedAt?: string | Date | null;
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
		feedback: {
			verdict: 'confirmed' | 'helpful' | 'incorrect' | 'still_investigating';
			note: string | null;
		} | null;
		repositories: Array<{ id: string; fullName: string }>;
	};

	const stages = ['Queued', 'Provisioning', 'Repositories', 'Analyzing', 'Synthesis', 'Complete'];

	let { initial }: { initial: Data } = $props();

	// Intentional one-time seed: the {#key} on incident id in +page.svelte remounts this
	// component when navigating between incidents, so `initial` never changes in place.
	// svelte-ignore state_referenced_locally
	let data = $state(initial);
	let error = $state('');
	let connected = $state(false);
	let retrying = $state(false);
	let retryError = $state('');
	let revisionMessage = $state('');

	const activityStartedAt = $derived(
		data.currentRun?.startedAt ?? data.steps[0]?.createdAt ?? data.incident.occurredAt
	);

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

	const repositoryFor = (repositoryId: string) =>
		data.repositories.find((repository) => repository.id === repositoryId);
	const repositoryUrl = (repositoryId: string, sha: string) => {
		const repository = repositoryFor(repositoryId);
		return repository
			? `https://github.com/${repository.fullName}/commit/${encodeURIComponent(sha)}`
			: null;
	};

	async function copyRevision(sha: string) {
		try {
			await navigator.clipboard.writeText(sha);
			revisionMessage = 'Commit SHA copied.';
		} catch {
			revisionMessage = 'Copy failed. Select the commit SHA and copy it manually.';
		}
	}
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
					{#if data.incident.resolvedAt}
						<span class="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
							Resolved
						</span>
					{/if}
					{#if !terminal}
						<span
							aria-live="polite"
							class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium {connected
								? 'bg-live/10 text-live'
								: 'bg-warning/10 text-warning'}"
						>
							<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
							{connected ? 'Live' : 'Reconnecting'}
						</span>
					{/if}
				</div>
				<h1
					class="font-display text-3xl leading-[1.08] font-semibold tracking-[-0.01em] text-pretty [overflow-wrap:anywhere] md:text-[44px]"
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
				{@const repository = repositoryFor(repositoryId)}
				{@const commitUrl = repositoryUrl(repositoryId, sha)}
				<RecordField label="Revision" class="col-span-2 sm:col-span-1">
					<span class="flex min-w-0 items-center gap-1">
						{#if commitUrl}
							<a
								href={commitUrl}
								target="_blank"
								rel="noreferrer"
								translate="no"
								class="min-w-0 truncate font-mono text-xs text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
							>
								{repository?.fullName}@{sha.slice(0, 12)}
								<ExternalLink aria-hidden="true" class="inline size-3" />
							</a>
						{:else}
							<span translate="no" class="min-w-0 truncate font-mono text-xs">
								{sha.slice(0, 12)}
							</span>
						{/if}
						<Button
							type="button"
							size="sm"
							variant="ghost"
							class="shrink-0 px-2"
							aria-label="Copy full commit SHA"
							title="Copy full commit SHA"
							onclick={() => copyRevision(sha)}
						>
							<Clipboard aria-hidden="true" class="size-3.5" />
						</Button>
					</span>
				</RecordField>
			{/each}
		</RecordFieldGrid>
		<p aria-live="polite" class="mt-2 min-h-4 text-xs text-success">{revisionMessage}</p>
	</header>
	{#if retryError}
		<div class="mt-4">
			<InlineAlert tone="danger">{retryError}</InlineAlert>
		</div>
	{/if}
	{#if data.incident.payload.description}
		<IncidentDescription
			description={data.incident.payload.description}
			collapsed={Boolean(diagnosis)}
		/>
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
	<DiagnosisReport
		{diagnosis}
		runId={data.currentRun?.id ?? null}
		feedback={data.feedback}
		resolvedAt={data.incident.resolvedAt ?? null}
		revisions={data.currentRun?.resolvedRevisions ?? []}
		repositories={data.repositories}
	/>
	<InvestigationRecord
		steps={data.steps}
		startedAt={activityStartedAt}
		live
		{connected}
		collapsed={Boolean(diagnosis)}
	/>
{/if}
