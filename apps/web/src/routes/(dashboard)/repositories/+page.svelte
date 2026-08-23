<script lang="ts">
	import Button from '$lib/components/ui/button.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import RepositoryList from './repository-list.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#snippet headerActions()}
	<Button href="/api/github/install">
		{data.hasInstallation ? 'Manage installation' : 'Connect GitHub'}
	</Button>
{/snippet}

{#snippet emptyActions()}
	<Button href="/api/github/install">
		{data.hasInstallation ? 'Refresh GitHub access' : 'Connect GitHub'}
	</Button>
{/snippet}

<PageHeader
	eyebrow="Read-only GitHub App"
	title="Repositories"
	description="Included repositories provide source, recent Actions runs, and deployment context during investigations. Installation credentials remain worker-only."
	actions={data.role === 'admin' ? headerActions : undefined}
/>
<div>
	{#if data.repositories.length}
		<RepositoryList
			canManage={data.role === 'admin'}
			repositories={data.repositories}
			setupMode={data.setupMode}
		/>
	{:else}
		<div class="mt-8">
			<EmptyState
				title="No synchronized repositories"
				actions={data.role === 'admin' ? emptyActions : undefined}
			>
				Connect or refresh the GitHub App installation to discover repositories.
			</EmptyState>
		</div>
	{/if}
</div>
