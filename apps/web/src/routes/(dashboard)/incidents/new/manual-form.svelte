<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import Textarea from '$lib/components/ui/textarea.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import type { ActionData } from './$types';

	let { services, form }: { services: Array<{ id: string; name: string }>; form: ActionData } =
		$props();

	let pending = $state(false);
	const occurredAtDefault = new Date().toISOString().slice(0, 16);
	const error = $derived(
		form ? (form.detail ?? 'Submission failed. Check the incident details and try again.') : ''
	);
</script>

<form
	method="POST"
	action="?/create"
	class="max-w-4xl space-y-10"
	use:enhance={({ formData }) => {
		pending = true;
		const occurredAt = new Date(String(formData.get('occurredAt')));
		if (!Number.isNaN(occurredAt.getTime())) formData.set('occurredAt', occurredAt.toISOString());
		return async ({ update }) => {
			await update();
			pending = false;
		};
	}}
>
	<section>
		<SectionHeader>
			{#snippet meta()}Required{/snippet}
			Incident identity
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
			Failure signal
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
		{pending ? 'Queuing analysis…' : 'Queue analysis'}
	</Button>
</form>
