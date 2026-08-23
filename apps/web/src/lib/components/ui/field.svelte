<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		label,
		forId,
		hint,
		error,
		class: className,
		children
	}: {
		label: string;
		forId: string;
		hint?: string;
		error?: string | string[];
		class?: string;
		children: Snippet;
	} = $props();

	const errorMessage = $derived(Array.isArray(error) ? error[0] : error);
</script>

<div class={cn('min-w-0', className)}>
	<label for={forId} class="mb-1.5 block text-sm font-medium text-ink">
		{label}
	</label>
	{@render children()}
	{#if hint}
		<p id={`${forId}-hint`} class="mt-1.5 text-xs leading-5 text-ink-faint">{hint}</p>
	{/if}
	{#if errorMessage}
		<p id={`${forId}-error`} class="mt-1.5 text-xs leading-5 text-danger">{errorMessage}</p>
	{/if}
</div>
