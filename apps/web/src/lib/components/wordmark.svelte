<script lang="ts">
	import { Footprints } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { class: className }: { class?: string } = $props();
</script>

<span class={cn('inline-flex min-h-11 items-center gap-2', className)}>
	<span aria-hidden="true" class="grid size-7 place-items-center rounded-lg bg-accent text-white">
		<Footprints class="size-4" stroke-width={2.2} />
	</span>
	<span class="font-display text-[17px] font-semibold tracking-[-0.015em] text-ink">Legwork</span>
</span>
