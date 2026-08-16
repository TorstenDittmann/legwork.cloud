<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import SeverityMark from '$lib/components/ui/severity-mark.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const stats = $derived([
		['Services', data.serviceCount],
		['Incidents this month', data.incidentCount],
		['Active analyses', data.activeCount]
	] as const);
</script>

<PageHeader
	eyebrow="Operational briefing"
	title="Incident Overview"
	description={new Intl.DateTimeFormat('en', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(data.month)}
>
	{#snippet actions()}
		<Button href="/incidents/new">Submit Incident</Button>
	{/snippet}
</PageHeader>
<dl
	class="mt-7 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-3"
>
	{#each stats as [label, value] (label)}
		<div class="bg-surface px-5 py-4">
			<dt class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
				{label}
			</dt>
			<dd class="mt-2 font-display text-3xl font-semibold tracking-[-0.01em] tabular-nums">
				{value}
			</dd>
		</div>
	{/each}
</dl>
<section class="mt-12">
	<SectionHeader>
		{#snippet meta()}{data.recent.length} records{/snippet}
		Recent Incidents
	</SectionHeader>
	{#if data.recent.length}
		<div class="rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]">
			{#each data.recent as incident (incident.id)}
				<a
					href={`/incidents/${incident.id}`}
					class="grid gap-3 border-b border-rule px-4 py-4 last:border-0 hover:bg-surface-raised/60 sm:grid-cols-[100px_minmax(0,1fr)_140px_120px] sm:items-center"
				>
					<SeverityMark severity={incident.severity} />
					<div class="min-w-0">
						<p class="truncate text-sm font-medium text-ink">{incident.title}</p>
						<p class="mt-1 text-xs text-ink-faint">{incident.serviceName}</p>
					</div>
					<time class="font-mono text-[10px] text-ink-faint tabular-nums">
						{formatDateTime(incident.occurredAt)}
					</time>
					<StatusMark status={incident.runStatus} class="justify-self-start" />
				</a>
			{/each}
		</div>
	{:else}
		<EmptyState title="No Incidents Yet">
			Submit an incident to begin the first evidence-backed investigation.
		</EmptyState>
	{/if}
</section>
