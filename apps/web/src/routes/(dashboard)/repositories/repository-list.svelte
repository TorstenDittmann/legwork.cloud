<script lang="ts">
	import { enhance } from '$app/forms';
	import { Archive, Check, GitBranch, LoaderCircle, Search, Unplug, X } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import type { SubmitFunction } from './$types';

	interface RepositoryItem {
		id: string;
		fullName: string;
		defaultBranch: string;
		selected: boolean;
		archived: boolean;
		removedAt: string | null;
	}

	let {
		repositories,
		canManage,
		setupMode
	}: {
		repositories: RepositoryItem[];
		canManage: boolean;
		setupMode?: boolean;
	} = $props();

	let search = $state('');
	let mutationError = $state(false);
	let pendingId = $state<string | null>(null);
	// Optimistic per-row overrides, cleared once invalidation reconciles the load data.
	let overrides = $state<Record<string, boolean>>({});

	const rows = $derived(
		repositories.map((repository) =>
			repository.id in overrides
				? { ...repository, selected: overrides[repository.id] }
				: repository
		)
	);
	const deferredSearch = $derived(search.trim().toLowerCase());
	const filtered = $derived(
		deferredSearch
			? rows.filter((repository) =>
					`${repository.fullName} ${repository.defaultBranch}`
						.toLowerCase()
						.includes(deferredSearch)
				)
			: rows
	);
	const included = $derived(
		rows.filter((repository) => repository.selected && !repository.removedAt).length
	);

	const submitToggle: SubmitFunction = ({ formData }) => {
		const id = String(formData.get('repositoryId'));
		mutationError = false;
		pendingId = id;
		overrides[id] = formData.get('selected') === 'true';
		return async ({ result, update }) => {
			if (result.type === 'failure' || result.type === 'error') {
				delete overrides[id];
				mutationError = true;
			} else {
				await update();
				delete overrides[id];
			}
			pendingId = null;
		};
	};
</script>

<section class="mt-7" aria-labelledby="repository-inventory-title">
	{#if setupMode && included > 0}
		<div
			class="mb-5 flex flex-col gap-4 rounded-xl border border-accent/20 bg-accent-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<p class="text-sm font-semibold text-ink">Repository included</p>
				<p class="mt-1 text-sm text-ink-muted">
					Next, map it to the service you want to investigate.
				</p>
			</div>
			<Button href="/services/new?setup=1">Continue to service</Button>
		</div>
	{/if}
	<div class="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<div class="flex items-center gap-2">
				<h2
					id="repository-inventory-title"
					class="font-display text-xl font-semibold tracking-[-0.005em]"
				>
					Repository inventory
				</h2>
			</div>
			<p class="mt-1 text-sm text-ink-faint">
				{included} included · {repositories.length} synchronized
			</p>
		</div>
		<label class="relative block w-full sm:w-72">
			<span class="sr-only">Search repositories</span>
			<Search
				class="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-faint"
				aria-hidden="true"
			/>
			<Input bind:value={search} placeholder="Search repositories…" class="pr-11 pl-9" />
			{#if search}
				<button
					type="button"
					onclick={() => (search = '')}
					aria-label="Clear search"
					class="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-faint hover:text-ink"
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

	<div class="mt-3 overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
		<div
			class="hidden grid-cols-[minmax(0,1fr)_180px_110px_104px] gap-4 border-b border-rule bg-surface-raised/60 px-5 py-2.5 text-xs font-medium text-ink-faint md:grid"
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
					class="grid min-h-12 items-center gap-2 border-b border-rule px-5 py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_180px_110px_104px] md:gap-4"
				>
					<div class="min-w-0">
						<p translate="no" class="truncate text-sm font-medium text-ink">
							{repository.fullName}
						</p>
					</div>
					<div class="flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink-faint">
						<GitBranch class="size-3 shrink-0" aria-hidden="true" />
						<span class="truncate">{repository.defaultBranch}</span>
					</div>
					<div>
						{#if unavailable}
							<Badge tone="danger">
								<Unplug class="size-3" />
								Removed
							</Badge>
						{:else if repository.archived}
							<Badge tone="warning">
								<Archive class="size-3" />
								Archived
							</Badge>
						{:else}
							<Badge tone="success">Active</Badge>
						{/if}
					</div>
					<div class="flex justify-end">
						{#if canManage && !unavailable}
							<form method="POST" action="?/toggle" use:enhance={submitToggle}>
								<input type="hidden" name="repositoryId" value={repository.id} />
								<input type="hidden" name="selected" value={String(!repository.selected)} />
								<Button
									type="submit"
									size="sm"
									variant={repository.selected ? 'ghost' : 'outline'}
									class={repository.selected ? 'text-success hover:text-success' : ''}
									disabled={pending}
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
							</form>
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
