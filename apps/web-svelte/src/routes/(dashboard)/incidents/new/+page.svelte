<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ManualIncidentForm from './manual-form.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Submit an Incident — OnCall AI</title></svelte:head>

<PageHeader
	eyebrow="Manual intake"
	title="Submit an Incident"
	description="Provide the failure signal and enough operational context to begin a repository investigation."
/>
<div class="mt-8">
	<ManualIncidentForm services={data.services} />
</div>
