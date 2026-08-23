<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		class: className,
		value = $bindable(),
		...rest
	}: { class?: string; value?: string } & HTMLInputAttributes = $props();
</script>

<input
	bind:value
	class={cn(
		'h-11 w-full rounded-lg border border-rule-strong bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10',
		className
	)}
	{...rest}
/>
