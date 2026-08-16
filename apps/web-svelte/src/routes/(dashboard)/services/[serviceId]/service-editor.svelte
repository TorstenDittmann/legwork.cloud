<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/button.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Select from '$lib/components/ui/select.svelte';

	interface RepositoryOption {
		id: string;
		fullName: string;
	}
	interface Mapping {
		repositoryId: string;
		role: 'primary' | 'related';
	}

	let {
		serviceId,
		name,
		callbackUrl,
		enabled,
		repositories,
		mappings
	}: {
		serviceId: string;
		name: string;
		callbackUrl: string | null;
		enabled: boolean;
		repositories: RepositoryOption[];
		mappings: Mapping[];
	} = $props();

	let message = $state('');
	let error = $state('');
	let revealedKey = $state<string | null>(null);
	let pending = $state<'save' | 'rotate' | null>(null);
	let dirty = $state(false);

	const primary = $derived(mappings.find((mapping) => mapping.role === 'primary')?.repositoryId);
	const related = $derived(
		new Set(
			mappings
				.filter((mapping) => mapping.role === 'related')
				.map((mapping) => mapping.repositoryId)
		)
	);

	async function save(event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement }) {
		event.preventDefault();
		message = '';
		error = '';
		pending = 'save';
		const form = new FormData(event.currentTarget);
		const response = await fetch(`/api/services/${serviceId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: form.get('name'),
				primaryRepositoryId: form.get('primaryRepositoryId'),
				relatedRepositoryIds: form.getAll('relatedRepositoryIds').filter(Boolean),
				callbackUrl: form.get('callbackUrl') || null,
				enabled: form.get('enabled') === 'on'
			})
		});
		const body = await response.json();
		if (!response.ok) {
			error = body.detail ?? 'Unable to update service';
			pending = null;
			return;
		}
		message = 'Service updated.';
		dirty = false;
		pending = null;
		await invalidateAll();
	}

	async function rotateKey() {
		if (
			!window.confirm('Rotate this ingestion key? The current key will stop working immediately.')
		)
			return;
		message = '';
		error = '';
		revealedKey = null;
		pending = 'rotate';
		const response = await fetch(`/api/services/${serviceId}/rotate-key`, { method: 'POST' });
		const body = await response.json();
		if (!response.ok) {
			error = body.detail ?? 'Unable to rotate key';
			pending = null;
			return;
		}
		revealedKey = body.ingestionKey;
		pending = null;
		await invalidateAll();
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>

<div class="space-y-8">
	<form onsubmit={save} onchange={() => (dirty = true)} class="space-y-5">
		<Field label="Name" forId="service-name">
			<Input id="service-name" name="name" autocomplete="off" required value={name} />
		</Field>
		<Field label="Primary Repository" forId="primary-repository">
			<Select id="primary-repository" name="primaryRepositoryId" required value={primary}>
				{#each repositories as repository (repository.id)}
					<option value={repository.id}>{repository.fullName}</option>
				{/each}
			</Select>
		</Field>
		<fieldset>
			<legend class="text-xs font-medium">
				Related Repositories <span class="text-ink-faint">(up to 2)</span>
			</legend>
			<div class="mt-2 grid gap-px border border-rule bg-rule">
				{#each repositories as repository (repository.id)}
					<label class="flex min-h-10 items-center gap-3 bg-canvas px-3 text-sm">
						<input
							type="checkbox"
							name="relatedRepositoryIds"
							value={repository.id}
							checked={related.has(repository.id)}
							class="size-4 accent-accent"
						/>
						<span translate="no" class="min-w-0 truncate">
							{repository.fullName}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<Field label="Callback HTTPS URL" forId="callback-url">
			<Input
				id="callback-url"
				name="callbackUrl"
				type="url"
				autocomplete="url"
				value={callbackUrl ?? ''}
			/>
		</Field>
		<label class="flex items-center gap-3 text-sm">
			<input name="enabled" type="checkbox" checked={enabled} class="size-4 accent-accent" />
			Accept new incidents
		</label>
		{#if message}
			<InlineAlert tone="success">{message}</InlineAlert>
		{/if}
		{#if error}
			<InlineAlert tone="danger">{error}</InlineAlert>
		{/if}
		<Button type="submit" disabled={pending !== null}>
			{pending === 'save' ? 'Saving Service…' : 'Save Service'}
		</Button>
	</form>
	<div class="border-t border-rule pt-6">
		<p class="text-sm text-ink-muted">Rotating immediately revokes the current ingestion key.</p>
		<Button
			type="button"
			variant="outline"
			class="mt-3"
			onclick={rotateKey}
			disabled={pending !== null}
		>
			{pending === 'rotate' ? 'Rotating Key…' : 'Rotate Ingestion Key'}
		</Button>
		{#if revealedKey}
			<div class="mt-4 border-l-2 border-warning bg-surface-raised p-4">
				<p class="text-sm text-warning">Copy this key now. It will not be shown again.</p>
				<code translate="no" class="mt-2 block overflow-x-auto text-xs text-ink">
					{revealedKey}
				</code>
			</div>
		{/if}
	</div>
</div>
