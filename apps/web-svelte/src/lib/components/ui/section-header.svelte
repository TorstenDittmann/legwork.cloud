<script lang="ts">
	import type { Snippet } from 'svelte';

	let { meta, children }: { meta?: Snippet; children: Snippet } = $props();
</script>

<div class="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
	<h2 class="font-display text-lg font-semibold tracking-[-0.01em] text-ink">
		{@render children()}
	</h2>
	{#if meta}
		<div class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
			{@render meta()}
		</div>
	{/if}
</div>
