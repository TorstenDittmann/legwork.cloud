<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	// Pages contribute a `title` from their load; the suffix lives here only.
	const title = $derived(page.data.title ? `${page.data.title} — Legwork` : 'Legwork');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{title}</title>
	<meta
		name="description"
		content="Legwork investigates your incident in your own code — reading the exact commit that broke and citing every claim to a line."
	/>
</svelte:head>

{@render children()}
