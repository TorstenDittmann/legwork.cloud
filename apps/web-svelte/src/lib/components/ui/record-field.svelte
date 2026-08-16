<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		class: className,
		children
	}: { label: string; class?: string; children: Snippet } = $props();
</script>

<div class={cn('min-w-0 bg-surface px-3.5 py-3', className)}>
	<dt class="font-mono text-[9px] tracking-[0.08em] text-ink-faint uppercase">{label}</dt>
	<dd class="mt-1 truncate text-sm text-ink">{@render children()}</dd>
</div>
