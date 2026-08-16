<script lang="ts">
	import { Siren } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { class: className }: { class?: string } = $props();
</script>

<span class={cn('inline-flex items-center gap-2', className)}>
	<span aria-hidden="true" class="grid size-7 place-items-center rounded-lg bg-accent text-white">
		<Siren class="size-4" stroke-width={2.2} />
	</span>
	<span class="text-[15px] font-semibold tracking-[-0.01em] text-ink">OnCall AI</span>
</span>
