<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ManualIncidentForm from './manual-form.svelte';

	let { data, form } = $props();
</script>

<PageHeader
	eyebrow="New investigation"
	title="What went wrong?"
	description="Start with the signal you have. Legwork will inspect the linked code revision and build a cited diagnosis."
/>
<div class="mt-8">
	<ManualIncidentForm services={data.services} selectedServiceId={data.selectedServiceId} {form} />
</div>
