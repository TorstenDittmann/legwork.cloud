<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		actions
	}: {
		eyebrow?: string;
		title: string;
		description?: string;
		actions?: Snippet;
	} = $props();
</script>

<header>
	<div class="flex flex-wrap items-end justify-between gap-5">
		<div class="max-w-3xl min-w-0">
			{#if eyebrow}
				<p class="mb-2 text-sm font-medium text-accent">{eyebrow}</p>
			{/if}
			<h1
				class="font-display text-3xl leading-[1.1] font-semibold tracking-[-0.01em] text-pretty text-ink md:text-4xl"
			>
				{title}
			</h1>
			{#if description}
				<p class="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
</header>
