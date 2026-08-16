<script lang="ts">
	import type { Snippet } from 'svelte';

	let { meta, children }: { meta?: Snippet; children: Snippet } = $props();
</script>

<div class="mb-4 flex items-baseline justify-between gap-4">
	<h2 class="font-display text-xl font-semibold tracking-[-0.005em] text-ink">
		{@render children()}
	</h2>
	{#if meta}
		<div class="text-sm text-ink-faint">
			{@render meta()}
		</div>
	{/if}
</div>
