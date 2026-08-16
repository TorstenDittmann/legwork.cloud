<script lang="ts">
	import RecordFieldGrid from '$lib/components/ui/record-field-grid.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import LoadingStatus from '$lib/components/ui/loading-status.svelte';
	import Skeleton from '$lib/components/ui/skeleton.svelte';
</script>

<LoadingStatus label="Loading incident record" />
<header class="border-b border-rule pb-7">
	<a href="/incidents" class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
		← Incident Ledger
	</a>
	<div class="mt-5">
		<div class="mb-3 flex gap-3">
			<Skeleton class="h-5 w-16" />
			<Skeleton class="h-5 w-20" />
		</div>
		<Skeleton class="h-12 w-[38rem] max-w-full" />
	</div>
	<RecordFieldGrid class="mt-6 lg:grid-cols-5">
		{#each ['Service', 'Environment', 'Occurred', 'Analysis duration'] as label (label)}
			<div class="bg-surface px-3.5 py-3">
				<p class="font-mono text-[9px] tracking-[0.08em] text-ink-faint uppercase">{label}</p>
				<Skeleton class="mt-2 h-4 w-24" />
			</div>
		{/each}
	</RecordFieldGrid>
</header>
<section class="mt-9">
	<SectionHeader>Run Progress</SectionHeader>
	<div
		class="grid grid-cols-2 gap-px rounded-[4px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6"
	>
		{#each ['Queued', 'Provisioning', 'Repositories', 'Analyzing', 'Synthesis', 'Complete'] as stage (stage)}
			<div class="bg-surface p-4">
				<p class="text-xs text-ink-faint">{stage}</p>
				<Skeleton class="mt-3 h-2 w-full" />
			</div>
		{/each}
	</div>
</section>
