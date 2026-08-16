<script lang="ts">
	import Badge from '$lib/components/ui/badge.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import ProviderSetup from './provider-setup.svelte';
	import ServiceEditor from './service-editor.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#snippet actions()}
	<StatusMark status={data.service.enabled ? 'enabled' : 'disabled'} />
{/snippet}

<PageHeader
	eyebrow="Service specification"
	title={data.service.name}
	description={`Stable endpoint /api/v1/services/${data.service.slug}/incidents`}
	{actions}
/>
<div class="mt-8 grid gap-4 md:grid-cols-2">
	<Card>
		<CardHeader>
			<CardTitle>Ingestion</CardTitle>
		</CardHeader>
		<CardContent class="space-y-2 text-sm text-ink-muted">
			<p>
				Slug: <code translate="no" class="text-ink">{data.service.slug}</code>
			</p>
			<p>
				Active key: <code translate="no" class="text-ink">{data.keyPrefix}…</code>
			</p>
			<p>
				The stable slug cannot be edited. The full key is only revealed on creation or rotation.
			</p>
		</CardContent>
	</Card>
	<Card>
		<CardHeader>
			<CardTitle>Repositories</CardTitle>
		</CardHeader>
		<CardContent class="space-y-2 text-sm text-ink-muted">
			{#each data.mappings as mapping (mapping.repositoryId)}
				<p>
					<Badge>{mapping.role}</Badge> <span class="ml-2">{mapping.fullName}</span>
				</p>
			{/each}
		</CardContent>
	</Card>
</div>
{#if data.role === 'admin'}
	<Card class="mt-6">
		<CardHeader>
			<CardTitle>Provider integrations</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="mb-5 grid gap-2 text-sm text-ink-muted">
				{#each data.alertRows as integration (integration.id)}
					<p>
						{integration.name} · {integration.provider} webhook · {integration.lastReceivedAt
							? `last received ${formatDateTime(integration.lastReceivedAt)}`
							: 'waiting for first delivery'}
					</p>
				{/each}
				{#each data.bindingRows as binding (binding.id)}
					<p>
						{binding.name} · {binding.provider} context · {binding.enabled ? 'enabled' : 'disabled'}
					</p>
				{/each}
			</div>
			<ProviderSetup serviceId={data.serviceId} connections={data.connections} {form} />
		</CardContent>
	</Card>
	<Card class="mt-6">
		<CardHeader>
			<CardTitle>Edit service</CardTitle>
		</CardHeader>
		<CardContent>
			<ServiceEditor
				name={data.service.name}
				callbackUrl={data.service.callbackUrl}
				enabled={data.service.enabled}
				repositories={data.repositoryOptions}
				mappings={data.mappings}
			/>
		</CardContent>
	</Card>
{/if}
