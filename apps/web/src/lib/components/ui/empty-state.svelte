<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="rounded-[4px] border border-dashed border-rule-strong py-12 text-center">
	<p class="font-display text-lg font-semibold text-ink">{title}</p>
	<p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{@render children()}</p>
</div>
