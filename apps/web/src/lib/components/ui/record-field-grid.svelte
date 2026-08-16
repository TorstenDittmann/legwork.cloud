<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<!-- Soft-separated metadata cells. Override the column count via class when needed. -->
<dl
	class={cn(
		'grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule/70 shadow-card sm:grid-cols-3',
		className
	)}
>
	{@render children()}
</dl>
