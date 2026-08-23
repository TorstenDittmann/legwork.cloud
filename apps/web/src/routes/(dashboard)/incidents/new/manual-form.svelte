<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import Textarea from '$lib/components/ui/textarea.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import type { ActionData } from './$types';

	let {
		services,
		selectedServiceId,
		form
	}: {
		services: Array<{ id: string; name: string }>;
		selectedServiceId?: string | null;
		form: ActionData;
	} = $props();

	let pending = $state(false);
	let occurredAt = $state('');
	const error = $derived(
		form ? (form.detail ?? 'Submission failed. Check the incident details and try again.') : ''
	);
	const fieldError = (name: string) => form?.errors?.[name]?.[0];

	onMount(() => {
		if (occurredAt) return;
		const now = new Date();
		occurredAt = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
			.toISOString()
			.slice(0, 16);
	});
</script>

<form
	method="POST"
	action="?/create"
	class="max-w-3xl space-y-8"
	use:enhance={({ formData }) => {
		pending = true;
		const occurredAt = new Date(String(formData.get('occurredAt')));
		if (!Number.isNaN(occurredAt.getTime())) formData.set('occurredAt', occurredAt.toISOString());
		return async ({ update }) => {
			try {
				await update();
			} finally {
				pending = false;
			}
		};
	}}
>
	<section class="rounded-xl border border-rule bg-surface p-5 shadow-card sm:p-6">
		<SectionHeader>
			{#snippet meta()}Required{/snippet}
			Failure signal
		</SectionHeader>
		<div class="grid gap-5 sm:grid-cols-2">
			<Field label="Affected service" forId="serviceId" error={fieldError('serviceId')}>
				<Select
					id="serviceId"
					name="serviceId"
					required
					value={selectedServiceId ?? services[0]?.id}
					aria-invalid={fieldError('serviceId') ? 'true' : undefined}
					aria-describedby={fieldError('serviceId') ? 'serviceId-error' : undefined}
				>
					{#each services as service (service.id)}
						<option value={service.id}>{service.name}</option>
					{/each}
				</Select>
			</Field>
			<Field label="Severity" forId="severity" error={fieldError('severity')}>
				<Select
					id="severity"
					name="severity"
					value="unknown"
					aria-invalid={fieldError('severity') ? 'true' : undefined}
					aria-describedby={fieldError('severity') ? 'severity-error' : undefined}
				>
					{#each ['critical', 'high', 'medium', 'low', 'unknown'] as value (value)}
						<option>{value}</option>
					{/each}
				</Select>
			</Field>
			<Field label="Incident title" forId="title" class="sm:col-span-2" error={fieldError('title')}>
				<Input
					id="title"
					name="title"
					autocomplete="off"
					required
					maxlength={500}
					placeholder="API requests started returning 500s after deployment…"
					aria-invalid={fieldError('title') ? 'true' : undefined}
					aria-describedby={fieldError('title') ? 'title-error' : undefined}
				/>
			</Field>
			<Field label="When it started" forId="occurredAt" error={fieldError('occurredAt')}>
				<Input
					id="occurredAt"
					name="occurredAt"
					required
					type="datetime-local"
					bind:value={occurredAt}
					aria-invalid={fieldError('occurredAt') ? 'true' : undefined}
					aria-describedby={fieldError('occurredAt') ? 'occurredAt-error' : undefined}
				/>
			</Field>
			<Field label="Environment" forId="environment" error={fieldError('environment')}>
				<Input
					id="environment"
					name="environment"
					autocomplete="off"
					maxlength={128}
					placeholder="production · eu-west-1"
					aria-invalid={fieldError('environment') ? 'true' : undefined}
					aria-describedby={fieldError('environment') ? 'environment-error' : undefined}
				/>
			</Field>
		</div>
	</section>
	<section class="rounded-xl border border-rule bg-surface p-5 shadow-card sm:p-6">
		<SectionHeader>
			{#snippet meta()}Recommended{/snippet}
			Investigation context
		</SectionHeader>
		<div class="space-y-5">
			<Field
				label="What changed or failed?"
				forId="description"
				hint="Include expected behavior, what changed, and the observed impact."
				error={fieldError('description')}
			>
				<Textarea
					id="description"
					name="description"
					maxlength={32000}
					placeholder="The deploy completed at 14:20. Within two minutes…"
					aria-invalid={fieldError('description') ? 'true' : undefined}
					aria-describedby={`description-hint${fieldError('description') ? ' description-error' : ''}`}
				/>
			</Field>
			<Field label="Stack trace or logs" forId="stackTrace" error={fieldError('stackTrace')}>
				<Textarea
					id="stackTrace"
					name="stackTrace"
					spellcheck={false}
					class="min-h-48 font-mono text-xs"
					placeholder="Paste the most relevant stack trace or log excerpt…"
					aria-invalid={fieldError('stackTrace') ? 'true' : undefined}
					aria-describedby={fieldError('stackTrace') ? 'stackTrace-error' : undefined}
				/>
			</Field>
			<details class="rounded-lg border border-rule bg-surface-raised/50 px-4 py-3">
				<summary class="cursor-pointer text-sm font-medium text-ink">Advanced details</summary>
				<div class="mt-4">
					<Field
						label="External reference"
						forId="externalId"
						hint="Optional alert, ticket, or deployment ID. Legwork creates one when omitted."
						error={fieldError('externalId')}
					>
						<Input
							id="externalId"
							name="externalId"
							autocomplete="off"
							spellcheck={false}
							maxlength={255}
							placeholder="alert-prod-1042"
							aria-invalid={fieldError('externalId') ? 'true' : undefined}
							aria-describedby={`externalId-hint${fieldError('externalId') ? ' externalId-error' : ''}`}
						/>
					</Field>
				</div>
			</details>
		</div>
	</section>
	{#if error}
		<InlineAlert tone="danger">{error}</InlineAlert>
	{/if}
	<Button type="submit" disabled={pending}>
		{pending ? 'Starting investigation…' : 'Start investigation'}
	</Button>
</form>
