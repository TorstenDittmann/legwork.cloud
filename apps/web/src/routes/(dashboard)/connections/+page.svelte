<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import StatusMark from '$lib/components/ui/status-mark.svelte';
	import AddConnectionForm from './add-connection-form.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageHeader
	eyebrow="Organization integrations"
	title="Connections"
	description="Connect observability tools once, then choose which services can use their read-only context."
/>
{#if data.connections.length > 0}
	<div class="mt-8 grid gap-4 lg:grid-cols-2">
		{#each data.connections as connection (connection.id)}
			<Card>
				<CardHeader>
					<CardTitle>{connection.name}</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3 text-sm">
					<div class="flex items-center justify-between">
						<span class="capitalize">
							{connection.provider} · {connection.mode.replaceAll('_', ' ')}
						</span>
						<StatusMark
							status={!connection.enabled
								? 'disabled'
								: connection.lastVerifiedAt
									? 'enabled'
									: 'pending'}
						/>
					</div>
					<p class="text-ink-muted">{connection.baseUrl}</p>
					<p class="text-ink-muted">
						Capabilities: {connection.capabilities.join(', ') || 'none'}
					</p>
					<p class="text-xs text-ink-faint">
						{connection.lastVerifiedAt
							? `Verified ${formatDateTime(connection.lastVerifiedAt)}`
							: (connection.lastVerificationError ?? 'Not verified')}
					</p>
					{#if data.role === 'admin'}
						<div class="flex gap-2">
							<form method="POST" action="?/testConnection" use:enhance>
								<input type="hidden" name="id" value={connection.id} />
								<Button size="sm" variant="ghost">Test</Button>
							</form>
							<form method="POST" action="?/toggleConnection" use:enhance>
								<input type="hidden" name="id" value={connection.id} />
								<input type="hidden" name="enabled" value={String(!connection.enabled)} />
								<Button size="sm" variant="ghost">
									{connection.enabled ? 'Disable' : 'Enable'}
								</Button>
							</form>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/each}
	</div>
{:else}
	<div class="mt-8">
		<EmptyState title="No connections yet">
			No observability connections exist for this organization yet. An admin can connect Grafana or
			Sentry to get started.
		</EmptyState>
	</div>
{/if}
{#if data.role === 'admin'}
	<AddConnectionForm defaultOpen={data.connections.length === 0} />
{/if}
