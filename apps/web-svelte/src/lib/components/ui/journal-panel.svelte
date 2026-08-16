<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<section
	class={cn(
		'rounded-[4px] border border-rule bg-surface shadow-[0_1px_2px_rgba(23,26,32,0.04)]',
		className
	)}
>
	{@render children()}
</section>
