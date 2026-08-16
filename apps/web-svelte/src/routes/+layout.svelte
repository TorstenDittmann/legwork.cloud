<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>OnCall AI</title>
	<meta
		name="description"
		content="Evidence-backed incident diagnosis from exact source snapshots."
	/>
</svelte:head>

{@render children()}
