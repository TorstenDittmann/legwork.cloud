<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		forId,
		hint,
		class: className,
		children
	}: {
		label: string;
		forId: string;
		hint?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div class={cn('min-w-0', className)}>
	<label
		for={forId}
		class="mb-2 block font-mono text-[10px] tracking-[0.08em] text-ink-muted uppercase"
	>
		{label}
	</label>
	{@render children()}
	{#if hint}
		<p class="mt-1.5 text-xs leading-5 text-ink-faint">{hint}</p>
	{/if}
</div>
