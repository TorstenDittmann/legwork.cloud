<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		class: className,
		value = $bindable(),
		children,
		...rest
	}: { class?: string; value?: string; children: Snippet } & HTMLSelectAttributes = $props();
</script>

<select
	bind:value
	class={cn(
		'h-11 w-full rounded-lg border border-rule-strong bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 sm:h-10',
		className
	)}
	{...rest}
>
	{@render children()}
</select>
