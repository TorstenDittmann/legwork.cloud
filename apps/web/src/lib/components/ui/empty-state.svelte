<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div
	class="rounded-xl border border-dashed border-rule-strong bg-surface/60 px-6 py-14 text-center"
>
	<p class="font-display text-xl font-semibold text-ink">{title}</p>
	<p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{@render children()}</p>
</div>
