<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import SetupOverview from '$lib/components/setup-overview.svelte';
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
	title="Incident overview"
	description={new Intl.DateTimeFormat('en', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(data.month)}
>
	{#snippet actions()}
		{#if data.setup.activated}
			<Button href="/incidents/new">Start investigation</Button>
		{:else}
			<Button href={data.setup.nextStep?.href ?? '/dashboard'}>Continue setup</Button>
		{/if}
	{/snippet}
</PageHeader>
{#if !data.setup.activated}
	<SetupOverview
		progress={data.setup}
		canManage={data.role === 'admin'}
		connected={data.connected}
		missing={data.missing}
	/>
{/if}
<dl class="mt-7 grid gap-4 sm:grid-cols-3">
	{#each stats as [label, value] (label)}
		<div class="rounded-xl border border-rule bg-surface px-5 py-4 shadow-card">
			<dt class="text-sm font-medium text-ink-faint">{label}</dt>
			<dd class="mt-2 font-display text-3xl font-semibold tracking-[-0.01em] tabular-nums">
				{value}
			</dd>
		</div>
	{/each}
</dl>
<section class="mt-12">
	<SectionHeader>
		{#snippet meta()}{data.recent.length} records{/snippet}
		Recent incidents
	</SectionHeader>
	{#if data.recent.length}
		<div class="rounded-xl border border-rule bg-surface shadow-card">
			{#each data.recent as incident (incident.id)}
				<a
					href={`/incidents/${incident.id}`}
					class="grid gap-3 border-b border-rule px-5 py-4 last:border-0 hover:bg-surface-raised/60 sm:grid-cols-[100px_minmax(0,1fr)_140px_120px] sm:items-center"
				>
					<SeverityMark severity={incident.severity} />
					<div class="min-w-0">
						<p class="truncate text-sm font-medium text-ink">{incident.title}</p>
						<p class="mt-1 text-xs text-ink-faint">{incident.serviceName}</p>
					</div>
					<time class="font-mono text-xs text-ink-faint tabular-nums">
						{formatDateTime(incident.occurredAt)}
					</time>
					<StatusMark status={incident.runStatus} class="justify-self-start" />
				</a>
			{/each}
		</div>
	{:else}
		<EmptyState title="No incidents yet">
			Start with a real failure signal to begin your first evidence-backed investigation.
			{#snippet actions()}
				{#if data.setup.serviceCount > 0}
					<Button href="/incidents/new">Start first investigation</Button>
				{:else}
					<Button href={data.setup.nextStep?.href ?? '/dashboard'}>Continue setup</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{/if}
</section>
