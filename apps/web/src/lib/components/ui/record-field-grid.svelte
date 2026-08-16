<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<!-- Hairline-separated metadata cells, the document-header field grid of the
     record motif. Override the column count via class when needed. -->
<dl
	class={cn(
		'grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule sm:grid-cols-3',
		className
	)}
>
	{@render children()}
</dl>
