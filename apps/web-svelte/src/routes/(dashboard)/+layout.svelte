<script lang="ts">
	import DashboardShell from '$lib/components/dashboard-shell.svelte';

	let { data, children } = $props();
</script>

<DashboardShell
	organizations={data.organizations}
	organizationId={data.organizationId}
	email={data.email}
>
	{@render children()}
</DashboardShell>
