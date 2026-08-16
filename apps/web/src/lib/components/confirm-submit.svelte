<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/button.svelte';

	let { message, children }: { message: string; children: Snippet } = $props();
</script>

<Button
	type="submit"
	size="sm"
	variant="destructive"
	onclick={(event) => {
		if (!window.confirm(message)) event.preventDefault();
	}}
>
	{@render children()}
</Button>
