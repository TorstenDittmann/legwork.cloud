<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		class: className,
		children
	}: { label: string; class?: string; children: Snippet } = $props();
</script>

<div class={cn('min-w-0 bg-surface px-4 py-3.5', className)}>
	<dt class="text-xs font-medium text-ink-faint">{label}</dt>
	<dd class="mt-1 truncate text-sm text-ink">{@render children()}</dd>
</div>
