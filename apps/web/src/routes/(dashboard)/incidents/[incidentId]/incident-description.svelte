<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import {
		parseIncidentDescription,
		parseIncidentInline,
		type IncidentInlinePart
	} from '$lib/incident-presentation';

	let { description, collapsed = false }: { description: string; collapsed?: boolean } = $props();
	const blocks = $derived(parseIncidentDescription(description));
</script>

{#snippet inline(parts: IncidentInlinePart[])}
	{#each parts as part, index (`${part.type}-${part.text}-${index}`)}
		{#if part.type === 'code'}
			<code
				translate="no"
				class="rounded bg-surface-raised px-1 py-0.5 font-mono text-[0.9em] text-ink"
				>{part.text}</code
			>
		{:else if part.type === 'strong'}
			<strong class="font-semibold text-ink">{part.text}</strong>
		{:else}
			{part.text}
		{/if}
	{/each}
{/snippet}

<details
	open={!collapsed}
	class="group/details mt-7 min-w-0 rounded-xl border border-rule bg-surface"
>
	<summary
		class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-details-marker]:hidden"
	>
		<span class="min-w-0">
			<span class="block text-sm font-medium text-ink">Incident details</span>
			<span class="block text-xs text-ink-faint">Alert context supplied to the investigation</span>
		</span>
		<ChevronDown
			aria-hidden="true"
			class="size-4 shrink-0 text-ink-faint transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
		/>
	</summary>
	<div class="min-w-0 space-y-4 border-t border-rule px-4 py-4 text-sm leading-6 text-ink-muted">
		{#each blocks as block, index (`${block.type}-${index}`)}
			{#if block.type === 'heading'}
				<h2 class="scroll-mt-24 text-sm font-semibold text-ink">
					{@render inline(parseIncidentInline(block.text))}
				</h2>
			{:else if block.type === 'list'}
				<ul class="list-disc space-y-1.5 pl-5">
					{#each block.items as item, itemIndex (`${item}-${itemIndex}`)}
						<li class="break-words">{@render inline(parseIncidentInline(item))}</li>
					{/each}
				</ul>
			{:else if block.type === 'code'}
				<div class="min-w-0">
					{#if block.language}
						<p class="mb-1 font-mono text-[11px] text-ink-faint" translate="no">
							{block.language}
						</p>
					{/if}
					<pre
						translate="no"
						class="max-w-full overflow-x-auto rounded-lg border border-rule bg-surface-raised p-3 font-mono text-xs leading-5 text-ink-muted"><code
							>{block.text}</code
						></pre>
				</div>
			{:else if block.type === 'quote'}
				<blockquote class="border-l-2 border-accent/40 pl-3 break-words text-ink-muted">
					{@render inline(parseIncidentInline(block.text))}
				</blockquote>
			{:else}
				<p class="break-words">{@render inline(parseIncidentInline(block.text))}</p>
			{/if}
		{/each}
	</div>
</details>
