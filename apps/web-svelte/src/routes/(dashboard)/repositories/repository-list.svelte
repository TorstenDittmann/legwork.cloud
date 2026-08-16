<script lang="ts">
	import { onMount } from 'svelte';
	import { Archive, Check, GitBranch, LoaderCircle, Search, Unplug, X } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';

	interface RepositoryItem {
		id: string;
		fullName: string;
		defaultBranch: string;
		selected: boolean;
		archived: boolean;
		removedAt: string | null;
	}

	let {
		initialRepositories,
		canManage
	}: {
		initialRepositories: RepositoryItem[];
		canManage: boolean;
	} = $props();

	// Mirrors react-query initialData: seed once, then client-owned.
	// svelte-ignore state_referenced_locally
	let repositories = $state(initialRepositories);
	let search = $state('');
	let isFetching = $state(false);
	let isError = $state(false);
	let mutationError = $state(false);
	let pendingId = $state<string | null>(null);

	const deferredSearch = $derived(search.trim().toLowerCase());
	const filtered = $derived(
		deferredSearch
			? repositories.filter((repository) =>
					`${repository.fullName} ${repository.defaultBranch}`
						.toLowerCase()
						.includes(deferredSearch)
				)
			: repositories
	);
	const included = $derived(
		repositories.filter((repository) => repository.selected && !repository.removedAt).length
	);

	async function fetchRepositories(): Promise<RepositoryItem[]> {
		const response = await fetch('/api/repositories', { headers: { accept: 'application/json' } });
		if (!response.ok) throw new Error('Could not load repositories');
		return response.json() as Promise<RepositoryItem[]>;
	}

	async function updateRepository(id: string, selected: boolean): Promise<RepositoryItem> {
		const response = await fetch(`/api/repositories/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selected })
		});
		if (!response.ok) throw new Error('Could not update repository');
		const row = (await response.json()) as RepositoryItem & { removedAt: string | null };
		return { ...row, removedAt: row.removedAt ? new Date(row.removedAt).toISOString() : null };
	}

	async function refresh() {
		isFetching = true;
		try {
			repositories = await fetchRepositories();
			isError = false;
		} catch {
			isError = true;
		} finally {
			isFetching = false;
		}
	}

	onMount(() => {
		void refresh();
	});

	async function toggle(id: string, selected: boolean) {
		const previous = repositories;
		mutationError = false;
		pendingId = id;
		repositories = repositories.map((repository) =>
			repository.id === id ? { ...repository, selected } : repository
		);
		try {
			await updateRepository(id, selected);
		} catch {
			repositories = previous;
			mutationError = true;
		} finally {
			pendingId = null;
			await refresh();
		}
	}
</script>

<section class="mt-7" aria-labelledby="repository-inventory-title">
	<div
		class="flex flex-col gap-3 border-b border-rule pb-4 sm:flex-row sm:items-end sm:justify-between"
	>
		<div>
			<div class="flex items-center gap-2">
				<h2 id="repository-inventory-title" class="font-display text-lg font-semibold">
					Repository inventory
				</h2>
				{#if isFetching}
					<LoaderCircle class="size-3.5 animate-spin text-ink-faint" aria-label="Refreshing" />
				{/if}
			</div>
			<p class="mt-1 text-xs text-ink-faint">
				{included} included · {repositories.length} synchronized
			</p>
		</div>
		<label class="relative block w-full sm:w-72">
			<span class="sr-only">Search repositories</span>
			<Search
				class="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-faint"
				aria-hidden="true"
			/>
			<Input bind:value={search} placeholder="Search repositories…" class="h-9 pr-9 pl-9" />
			{#if search}
				<button
					type="button"
					onclick={() => (search = '')}
					aria-label="Clear search"
					class="absolute top-2.5 right-3 text-ink-faint hover:text-ink"
				>
					<X class="size-4" />
				</button>
			{/if}
		</label>
	</div>

	{#if mutationError}
		<p class="mt-3 text-xs text-danger" role="alert">
			Unable to update the repository. Your previous selection was restored.
		</p>
	{/if}
	{#if isError}
		<p class="mt-3 text-xs text-danger" role="alert">
			Repository refresh failed. Showing the last available data.
		</p>
	{/if}

	<div
		class="mt-3 overflow-hidden rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]"
	>
		<div
			class="hidden grid-cols-[minmax(0,1fr)_180px_110px_104px] gap-4 border-b border-rule bg-surface-raised/60 px-4 py-2 font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase md:grid"
		>
			<span>Repository</span>
			<span>Default branch</span>
			<span>Status</span>
			<span class="text-right">Access</span>
		</div>
		{#if filtered.length}
			{#each filtered as repository (repository.id)}
				{@const unavailable = Boolean(repository.removedAt)}
				{@const pending = pendingId === repository.id}
				<div
					class="grid min-h-12 items-center gap-2 border-b border-rule px-4 py-2.5 last:border-0 md:grid-cols-[minmax(0,1fr)_180px_110px_104px] md:gap-4"
				>
					<div class="min-w-0">
						<p translate="no" class="truncate text-sm font-medium text-ink">
							{repository.fullName}
						</p>
					</div>
					<div class="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-ink-faint">
						<GitBranch class="size-3 shrink-0" aria-hidden="true" />
						<span class="truncate">{repository.defaultBranch}</span>
					</div>
					<div>
						{#if unavailable}
							<Badge tone="danger">
								<Unplug class="size-2.5" />
								Removed
							</Badge>
						{:else if repository.archived}
							<Badge tone="warning">
								<Archive class="size-2.5" />
								Archived
							</Badge>
						{:else}
							<Badge tone="success">Active</Badge>
						{/if}
					</div>
					<div class="flex justify-end">
						{#if canManage && !unavailable}
							<Button
								size="sm"
								variant={repository.selected ? 'ghost' : 'outline'}
								class={repository.selected ? 'text-success hover:text-success' : ''}
								disabled={pending}
								onclick={() => toggle(repository.id, !repository.selected)}
							>
								{#if pending}
									<LoaderCircle class="size-3.5 animate-spin" />
								{:else if repository.selected}
									<Check class="size-3.5" />
									Included
								{:else}
									Include
								{/if}
							</Button>
						{:else}
							<span class="text-xs text-ink-faint">
								{repository.selected ? 'Included' : 'Excluded'}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		{:else}
			<div class="px-4 py-10 text-center">
				<p class="text-sm font-medium">No repositories found</p>
				<p class="mt-1 text-xs text-ink-faint">Try a different repository or branch name.</p>
			</div>
		{/if}
	</div>
</section>
