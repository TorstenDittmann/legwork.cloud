<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/button.svelte';

	const title = $derived(page.status === 404 ? 'Page not found' : 'Something went wrong');
	const fallback = $derived(
		page.status === 404
			? 'The page you’re looking for doesn’t exist or has moved.'
			: 'An unexpected error occurred while handling this request. Try again in a moment.'
	);
	const raw = $derived(page.error?.message);
	const message = $derived(raw && raw !== 'Not Found' && raw !== 'Internal Error' ? raw : fallback);
</script>

<main class="grid min-h-screen place-items-center px-5 py-16">
	<div class="w-full max-w-md text-center">
		<p class="font-mono text-xs tracking-[0.12em] text-ink-faint uppercase">{page.status}</p>
		<h1 class="mt-3 font-display text-4xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
		<p class="mx-auto mt-4 text-sm leading-6 text-ink-muted">{message}</p>
		<div class="mt-8">
			<Button href="/" variant="outline">Back to home</Button>
		</div>
	</div>
</main>
