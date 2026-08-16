<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Select from '$lib/components/ui/select.svelte';

	let {
		serviceId,
		connections,
		form
	}: {
		serviceId: string;
		connections: Array<{ id: string; name: string; provider: string }>;
		form: { secret?: string; webhookUrl?: string; error?: string } | null | undefined;
	} = $props();

	let pending = $state(false);
</script>

<div class="grid gap-6 md:grid-cols-2">
	<form
		method="POST"
		action="?/createIntegration"
		class="space-y-3"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				pending = false;
				await update();
			};
		}}
	>
		<input type="hidden" name="serviceId" value={serviceId} />
		<Field label="Alert provider" forId="alert-provider">
			<Select id="alert-provider" name="provider">
				<option value="grafana">Grafana Alerting / IRM</option>
				<option value="sentry">Sentry Internal Integration</option>
			</Select>
		</Field>
		<Field label="Integration name" forId="integration-name">
			<Input id="integration-name" name="name" required />
		</Field>
		<Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create webhook'}</Button>
		{#if form?.error}
			<p class="text-sm text-danger">{form.error}</p>
		{/if}
		{#if form?.webhookUrl}
			<div class="border border-rule p-3 text-xs">
				<p class="font-semibold">Copy these now. The secret will not be shown again.</p>
				<p class="mt-2 font-mono break-all">URL: {form.webhookUrl}</p>
				<p class="mt-2 font-mono break-all">Secret: {form.secret}</p>
			</div>
		{/if}
	</form>
	<form method="POST" action="?/bindConnection" class="space-y-3" use:enhance>
		<input type="hidden" name="serviceId" value={serviceId} />
		<Field label="Context connection" forId="connection-id">
			<Select id="connection-id" name="connectionId" required>
				<option value="">Select a verified connection…</option>
				{#each connections as connection (connection.id)}
					<option value={connection.id}>{connection.name} · {connection.provider}</option>
				{/each}
			</Select>
		</Field>
		<p class="text-xs text-ink-muted">
			Binding enables only the connection’s verified read capabilities. One enabled connection per
			provider is retained.
		</p>
		<Button type="submit" disabled={!connections.length}>Bind connection</Button>
	</form>
</div>
