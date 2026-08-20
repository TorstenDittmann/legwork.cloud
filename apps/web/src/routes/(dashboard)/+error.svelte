<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button.svelte';

	const title = $derived(page.status === 404 ? 'Page not found' : 'Something went wrong');
	const fallback = $derived(
		page.status === 404
			? 'This page doesn’t exist or has moved.'
			: 'An unexpected error occurred while loading this page. Try again in a moment.'
	);
	const raw = $derived(page.error?.message);
	const message = $derived(raw && raw !== 'Not Found' && raw !== 'Internal Error' ? raw : fallback);
</script>

<div class="mx-auto max-w-lg py-14 text-center sm:py-20">
	<p class="font-mono text-xs tracking-[0.12em] text-ink-faint uppercase">{page.status}</p>
	<h1 class="mt-3 font-display text-3xl leading-[1.1] font-semibold tracking-[-0.01em] text-ink">
		{title}
	</h1>
	<p class="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-muted">{message}</p>
	<div class="mt-8">
		<Button href="/dashboard" variant="outline">Back to overview</Button>
	</div>
</div>
