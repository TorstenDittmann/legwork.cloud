<script lang="ts">
	import IncidentLive from './incident-live.svelte';

	let { data } = $props();
</script>

{#key data.snapshot.incident.id}
	<IncidentLive initial={data.snapshot} />
{/key}
