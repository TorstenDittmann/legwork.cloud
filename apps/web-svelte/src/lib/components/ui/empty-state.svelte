<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, action, children }: { title: string; action?: Snippet; children: Snippet } =
		$props();
</script>

<div class="rounded-[4px] border border-dashed border-rule-strong py-12 text-center">
	<p class="font-display text-lg font-semibold text-ink">{title}</p>
	<p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{@render children()}</p>
	{#if action}
		<div class="mt-5">{@render action()}</div>
	{/if}
</div>
