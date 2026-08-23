<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { CheckCircle2, Eye, ShieldCheck, Sparkles } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import SetupChecklist from '$lib/components/setup-checklist.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let pollAttempts = $state(0);
	const syncPending = $derived(
		data.setup.installationCount > 0 && data.setup.repositoryCount === 0 && pollAttempts < 15
	);
	const syncTimedOut = $derived(
		data.setup.installationCount > 0 && data.setup.repositoryCount === 0 && pollAttempts >= 15
	);

	onMount(() => {
		let timer: number | undefined;
		let stopped = false;
		const poll = async () => {
			pollAttempts += 1;
			await invalidateAll();
			if (!stopped && syncPending) timer = window.setTimeout(() => void poll(), 2_000);
		};
		if (syncPending) timer = window.setTimeout(() => void poll(), 2_000);
		return () => {
			stopped = true;
			window.clearTimeout(timer);
		};
	});
</script>

{#snippet completionActions()}
	<Button href="/dashboard">Open dashboard</Button>
{/snippet}

<PageHeader
	eyebrow={data.setup.activated ? 'Activation complete' : 'Guided setup'}
	title={data.setup.activated ? 'Your workspace is ready' : 'Get to your first diagnosis'}
	description={data.setup.activated
		? 'Legwork has everything it needs to investigate incidents against your code and return cited evidence.'
		: 'Four focused steps connect your code, map a service, and prove the workflow with a real investigation.'}
	actions={data.setup.activated ? completionActions : undefined}
/>

<div class="mt-7 space-y-4" aria-live="polite">
	{#if data.connected && syncPending}
		<InlineAlert>
			GitHub is connected. We’re synchronizing your repository list now; this page will update
			automatically.
		</InlineAlert>
	{:else if data.connected && data.setup.repositoryCount > 0}
		<InlineAlert tone="success">
			GitHub is connected and {data.setup.repositoryCount}
			{data.setup.repositoryCount === 1 ? 'repository is' : 'repositories are'} ready to choose from.
		</InlineAlert>
	{:else if syncTimedOut}
		<InlineAlert tone="warning">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<span>
					Repository sync is taking longer than expected. It may still be finishing in the
					background.
				</span>
				<Button href="/setup" size="sm" variant="outline">Refresh status</Button>
			</div>
		</InlineAlert>
	{/if}
	{#if data.missing === 'repository'}
		<InlineAlert tone="warning">Include a repository before creating a service.</InlineAlert>
	{:else if data.missing === 'service'}
		<InlineAlert tone="warning">Create a service before starting an investigation.</InlineAlert>
	{/if}
</div>

<div class="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
	<SetupChecklist progress={data.setup} canManage={data.role === 'admin'} />

	<aside class="space-y-4">
		<div class="rounded-xl border border-rule bg-surface p-5 shadow-card">
			<div class="flex items-center gap-2">
				<Sparkles class="size-4 text-accent" aria-hidden="true" />
				<h2 class="text-sm font-semibold text-ink">Your activation moment</h2>
			</div>
			<p class="mt-3 text-sm leading-6 text-ink-muted">
				Setup is complete when your first investigation returns a diagnosis with evidence from the
				exact code revision involved.
			</p>
		</div>
		<div class="rounded-xl border border-rule bg-surface p-5 shadow-card">
			<h2 class="text-sm font-semibold text-ink">Designed for least privilege</h2>
			<ul class="mt-4 space-y-3 text-sm leading-6 text-ink-muted">
				<li class="flex gap-2.5">
					<Eye class="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
					<span>Repository access is read-only and limited to what you include.</span>
				</li>
				<li class="flex gap-2.5">
					<ShieldCheck class="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
					<span>Installation credentials stay server-side and worker-only.</span>
				</li>
				<li class="flex gap-2.5">
					<CheckCircle2 class="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
					<span>Legwork suggests fixes; it never writes changes back to GitHub.</span>
				</li>
			</ul>
		</div>
	</aside>
</div>
