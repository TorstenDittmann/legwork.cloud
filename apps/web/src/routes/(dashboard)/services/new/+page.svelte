<script lang="ts">
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import ServiceForm from './service-form.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<PageHeader
	eyebrow="Configuration"
	title="New service"
	description="Create a stable incident endpoint and bind it to the repositories the agent may inspect."
/>
<div class="mt-8">
	<ServiceForm repositories={data.repositories} {form} />
</div>
