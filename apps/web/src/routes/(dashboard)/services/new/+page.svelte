<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ServiceForm from './service-form.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<PageHeader
	eyebrow="Workspace setup"
	title="Create your first service"
	description="Choose the codebase behind this service. Legwork will use that boundary for every investigation."
/>
<div class="mt-8">
	<ServiceForm repositories={data.repositories} {form} />
</div>
