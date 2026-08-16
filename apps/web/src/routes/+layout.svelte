<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	// Pages contribute a `title` from their load; the suffix lives here only.
	const title = $derived(page.data.title ? `${page.data.title} — OnCall AI` : 'OnCall AI');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{title}</title>
	<meta
		name="description"
		content="Evidence-backed incident diagnosis from exact source snapshots."
	/>
</svelte:head>

{@render children()}
