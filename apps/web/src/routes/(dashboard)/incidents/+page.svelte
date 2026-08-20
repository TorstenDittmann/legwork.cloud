<script lang="ts">
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import SeverityMark from '$lib/components/ui/severity-mark.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import { formatDateTime, formatDuration } from '$lib/utils';
	import { runStatusSchema } from '@legwork/contracts';

	let { data } = $props();

	const pageHref = (target: number) => {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (target > 1) params.set('page', String(target));
		else params.delete('page');
		const query = params.toString();
		return query ? `?${query}` : page.url.pathname;
	};
	const prevHref = $derived(pageHref(data.page - 1));
	const nextHref = $derived(pageHref(data.page + 1));
</script>

<PageHeader
	eyebrow="30-day retention"
	title="Incident ledger"
	description="Every report, run, and verified conclusion in chronological order."
>
	{#snippet actions()}
		<Button href="/incidents/new">Submit incident</Button>
	{/snippet}
</PageHeader>
<form
	class="mt-7 grid gap-3 rounded-xl border border-rule bg-surface p-4 shadow-card md:grid-cols-6"
>
	<Field label="Search" forId="q" class="md:col-span-6">
		<Input
			id="q"
			name="q"
			placeholder="Search titles…"
			maxlength={200}
			value={data.filters.q ?? ''}
		/>
	</Field>
	<Field label="Status" forId="status">
		<Select id="status" name="status" value={data.filters.status ?? ''}>
			<option value="">All statuses</option>
			{#each runStatusSchema.options as value (value)}
				<option>{value}</option>
			{/each}
		</Select>
	</Field>
	<Field label="Severity" forId="severity">
		<Select id="severity" name="severity" value={data.filters.severity ?? ''}>
			<option value="">All severities</option>
			{#each ['critical', 'high', 'medium', 'low', 'unknown'] as value (value)}
				<option>{value}</option>
			{/each}
		</Select>
	</Field>
	<Field label="Service" forId="service">
		<Select id="service" name="service" value={data.filters.service ?? ''}>
			<option value="">All services</option>
			{#each data.serviceRows as service (service.id)}
				<option value={service.id}>{service.name}</option>
			{/each}
		</Select>
	</Field>
	<Field label="From" forId="from">
		<Input
			id="from"
			name="from"
			aria-label="From date"
			type="date"
			value={data.filters.from ?? ''}
		/>
	</Field>
	<Field label="To" forId="to">
		<Input id="to" name="to" aria-label="To date" type="date" value={data.filters.to ?? ''} />
	</Field>
	<div class="flex items-end gap-2">
		<Button type="submit" variant="outline">Filter</Button>
		{#if data.hasFilters}
			<Button href="/incidents" variant="link">Clear</Button>
		{/if}
	</div>
</form>
<div class="mt-6">
	{#if data.displayed.length}
		<div class="rounded-xl border border-rule bg-surface shadow-card">
			<div
				class="hidden grid-cols-[100px_minmax(0,1fr)_160px_160px_130px_100px] gap-3 border-b border-rule px-5 py-3 text-xs font-medium text-ink-faint md:grid"
			>
				<span>Severity</span>
				<span>Incident</span>
				<span>Service</span>
				<span>Occurred</span>
				<span>Status</span>
				<span>Duration</span>
			</div>
			{#each data.displayed as { incident, serviceName, run } (incident.id)}
				<div
					class="content-auto grid gap-3 border-b border-rule px-5 py-4 last:border-0 md:grid-cols-[100px_minmax(0,1fr)_160px_160px_130px_100px] md:items-center"
				>
					<SeverityMark severity={incident.severity} />
					<div class="min-w-0">
						<a
							href={`/incidents/${incident.id}`}
							class="block truncate font-medium text-ink hover:text-accent"
						>
							{incident.title}
						</a>
					</div>
					<span class="text-xs text-ink-muted">{serviceName}</span>
					<time class="font-mono text-xs text-ink-faint tabular-nums">
						{formatDateTime(incident.occurredAt)}
					</time>
					<StatusMark status={run?.status ?? 'queued'} class="justify-self-start" />
					<span class="font-mono text-xs text-ink-faint tabular-nums">
						{run?.startedAt && run.completedAt
							? formatDuration(run.completedAt.getTime() - run.startedAt.getTime())
							: '—'}
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<EmptyState title="No matching incidents">
			Adjust the current filters or submit a new incident.
		</EmptyState>
	{/if}
	{#if data.total > 0}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-ink-faint">
				{#if data.pageCount > 1}
					Page {data.page} of {data.pageCount} ·
				{/if}
				{data.total}
				{data.total === 1 ? 'incident' : 'incidents'}
			</p>
			{#if data.pageCount > 1}
				<nav aria-label="Pagination" class="flex items-center gap-2">
					<Button
						variant="outline"
						href={data.page > 1 ? prevHref : undefined}
						disabled={data.page <= 1}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						href={data.page < data.pageCount ? nextHref : undefined}
						disabled={data.page >= data.pageCount}
					>
						Next
					</Button>
				</nav>
			{/if}
		</div>
	{/if}
</div>
