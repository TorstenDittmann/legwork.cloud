<script lang="ts">
	import Badge from './badge.svelte';
	import { statusTone } from './status';
	import { cn } from '$lib/utils';

	let { status, class: className }: { status: string; class?: string } = $props();
</script>

<Badge tone={statusTone[status] ?? 'neutral'} class={cn('capitalize', className)}>
	<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
	{status}
</Badge>
