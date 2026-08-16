<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<h3 class={cn('font-display text-xl font-semibold tracking-[-0.005em] text-ink', className)}>
	{@render children()}
</h3>
