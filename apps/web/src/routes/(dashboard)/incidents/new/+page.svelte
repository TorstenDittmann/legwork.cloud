<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ManualIncidentForm from './manual-form.svelte';

	let { data, form } = $props();
</script>

<PageHeader
	eyebrow="Manual intake"
	title="Submit an incident"
	description="Provide the failure signal and enough operational context to begin a repository investigation."
/>
<div class="mt-8">
	<ManualIncidentForm services={data.services} {form} />
</div>
