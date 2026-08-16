<script lang="ts">
	import Badge from './badge.svelte';
	import { statusTone } from './status';

	let { status, class: className }: { status: string; class?: string } = $props();
</script>

<Badge tone={statusTone[status] ?? 'neutral'} class={className}>
	<span aria-hidden="true" class="size-1 bg-current"></span>
	{status}
</Badge>
