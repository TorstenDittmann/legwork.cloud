<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		class: className,
		value = $bindable(),
		...rest
	}: { class?: string; value?: string } & HTMLTextareaAttributes = $props();
</script>

<textarea
	bind:value
	class={cn(
		'min-h-28 w-full resize-y rounded-lg border border-rule-strong bg-surface p-3 text-sm text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-faint focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20',
		className
	)}
	{...rest}></textarea>
