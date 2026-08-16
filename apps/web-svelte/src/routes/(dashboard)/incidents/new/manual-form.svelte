<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import Textarea from '$lib/components/ui/textarea.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';

	let { services }: { services: Array<{ id: string; name: string }> } = $props();

	let error = $state('');
	let pending = $state(false);
	const occurredAtDefault = new Date().toISOString().slice(0, 16);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		pending = true;
		error = '';
		const form = new FormData(event.currentTarget as HTMLFormElement);
		const response = await fetch('/api/incidents/manual', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				serviceId: form.get('serviceId'),
				externalId: form.get('externalId'),
				title: form.get('title'),
				description: form.get('description') || undefined,
				severity: form.get('severity'),
				occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
				environment: form.get('environment') || undefined,
				stackTrace: form.get('stackTrace') || undefined
			})
		});
		const body = await response.json();
		if (!response.ok) {
			error = body.detail ?? 'Submission failed. Check the incident details and try again.';
			pending = false;
			return;
		}
		goto(`/incidents/${body.incidentId}`);
	}
</script>

<form onsubmit={submit} class="max-w-4xl space-y-10">
	<section>
		<SectionHeader>
			{#snippet meta()}Required{/snippet}
			Incident Identity
		</SectionHeader>
		<div class="grid gap-5 sm:grid-cols-2">
			<Field label="Service" forId="serviceId">
				<Select id="serviceId" name="serviceId" required>
					{#each services as service (service.id)}
						<option value={service.id}>{service.name}</option>
					{/each}
				</Select>
			</Field>
			<Field
				label="External ID"
				forId="externalId"
				hint="Your alert, ticket, or deployment identifier."
			>
				<Input
					id="externalId"
					name="externalId"
					autocomplete="off"
					spellcheck={false}
					required
					placeholder="alert-prod-1042…"
				/>
			</Field>
			<Field label="Title" forId="title" class="sm:col-span-2">
				<Input
					id="title"
					name="title"
					autocomplete="off"
					required
					placeholder="Describe the observable failure…"
				/>
			</Field>
			<Field label="Severity" forId="severity">
				<Select id="severity" name="severity" value="unknown">
					{#each ['critical', 'high', 'medium', 'low', 'unknown'] as value (value)}
						<option>{value}</option>
					{/each}
				</Select>
			</Field>
			<Field label="Occurred At" forId="occurredAt">
				<Input
					id="occurredAt"
					name="occurredAt"
					required
					type="datetime-local"
					value={occurredAtDefault}
				/>
			</Field>
			<Field label="Environment" forId="environment">
				<Input
					id="environment"
					name="environment"
					autocomplete="off"
					placeholder="production / eu-west-1…"
				/>
			</Field>
		</div>
	</section>
	<section>
		<SectionHeader>
			{#snippet meta()}Diagnostic context{/snippet}
			Failure Signal
		</SectionHeader>
		<div class="space-y-5">
			<Field
				label="Description"
				forId="description"
				hint="Include expected behavior, what changed, and the observed impact."
			>
				<Textarea
					id="description"
					name="description"
					placeholder="The deploy began failing after…"
				/>
			</Field>
			<Field label="Stack Trace" forId="stackTrace">
				<Textarea
					id="stackTrace"
					name="stackTrace"
					spellcheck={false}
					class="min-h-48 font-mono text-xs"
					placeholder="Paste the complete stack trace…"
				/>
			</Field>
		</div>
	</section>
	{#if error}
		<InlineAlert tone="danger">{error}</InlineAlert>
	{/if}
	<Button type="submit" disabled={pending}>
		{pending ? 'Queuing Analysis…' : 'Queue Analysis'}
	</Button>
</form>
