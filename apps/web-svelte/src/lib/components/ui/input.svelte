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
		'h-10 w-full rounded-[3px] border border-rule-strong bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...rest}
/>
