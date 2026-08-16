<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ServiceForm from './service-form.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>New Service — OnCall AI</title>
</svelte:head>

<PageHeader
	eyebrow="Configuration"
	title="New Service"
	description="Create a stable incident endpoint and bind it to the repositories the agent may inspect."
/>
<div class="mt-8">
	<ServiceForm repositories={data.repositories} />
</div>
