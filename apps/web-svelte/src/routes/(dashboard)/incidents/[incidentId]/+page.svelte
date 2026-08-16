<script lang="ts">
	import IncidentLive from './incident-live.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Incident — OnCall AI</title></svelte:head>

<IncidentLive incidentId={data.incidentId} />
