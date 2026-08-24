<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#snippet actions()}
	<Button href="/services/new">New service</Button>
{/snippet}

<PageHeader
	eyebrow="Configuration"
	title="Services"
	description="Map incident intake endpoints to the repositories that explain them."
	actions={data.role === 'admin' ? actions : undefined}
/>
<div class="mt-8">
	{#if data.services.length}
		<div class="rounded-xl border border-rule bg-surface shadow-card">
			{#each data.services as service (service.id)}
				<div
					class="grid gap-3 border-b border-rule px-5 py-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-center"
				>
					<div>
						<a
							href={`/services/${service.id}`}
							class="font-display text-lg font-semibold tracking-[-0.005em] text-ink hover:text-accent"
						>
							{service.name}
						</a>
						<p class="mt-1 font-mono text-xs break-all text-ink-faint">
							/api/v1/services/{service.slug}/incidents
						</p>
					</div>
					<StatusMark
						status={service.enabled ? 'enabled' : 'disabled'}
						class="sm:justify-self-start"
					/>
				</div>
			{/each}
		</div>
	{:else}
		<EmptyState title="No services yet">
			Connect GitHub, select a repository, and create the first intake endpoint.
			{#snippet actions()}
				{#if data.role === 'admin'}
					<Button href="/dashboard">Continue setup</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{/if}
</div>
