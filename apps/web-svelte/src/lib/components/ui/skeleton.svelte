<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let { class: className, ...rest }: { class?: string } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	aria-hidden="true"
	class={cn('animate-pulse rounded-[3px] bg-surface-raised', className)}
	{...rest}
></div>
