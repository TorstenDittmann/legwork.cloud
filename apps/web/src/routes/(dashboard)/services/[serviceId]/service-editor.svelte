<script lang="ts">
	import { enhance } from '$app/forms';
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
		name,
		callbackUrl,
		enabled,
		repositories,
		mappings
	}: {
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
	// Intentional form-local seeds; page data does not change while this editor is mounted.
	// svelte-ignore state_referenced_locally
	let primaryRepositoryId = $state(
		mappings.find((mapping) => mapping.role === 'primary')?.repositoryId ??
			repositories[0]?.id ??
			''
	);
	// svelte-ignore state_referenced_locally
	let relatedRepositoryIds = $state(
		mappings.filter((mapping) => mapping.role === 'related').map((mapping) => mapping.repositoryId)
	);

	function removePrimaryFromRelated() {
		relatedRepositoryIds = relatedRepositoryIds.filter(
			(repositoryId) => repositoryId !== primaryRepositoryId
		);
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>

<div class="space-y-8">
	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			message = '';
			error = '';
			pending = 'save';
			return async ({ result, update }) => {
				pending = null;
				if (result.type === 'failure') {
					error =
						typeof result.data?.detail === 'string'
							? result.data.detail
							: 'Unable to update service';
					return;
				}
				if (result.type === 'success') {
					message = 'Service updated.';
					dirty = false;
				}
				await update({ reset: false });
			};
		}}
		onchange={() => (dirty = true)}
		class="space-y-5"
	>
		<Field label="Name" forId="service-name">
			<Input id="service-name" name="name" autocomplete="off" required value={name} />
		</Field>
		<Field label="Primary repository" forId="primary-repository">
			<Select
				id="primary-repository"
				name="primaryRepositoryId"
				required
				bind:value={primaryRepositoryId}
				onchange={removePrimaryFromRelated}
			>
				{#each repositories as repository (repository.id)}
					<option value={repository.id}>{repository.fullName}</option>
				{/each}
			</Select>
		</Field>
		<fieldset>
			<legend class="text-sm font-medium">
				Related repositories <span class="font-normal text-ink-faint">(up to 2)</span>
			</legend>
			<div class="mt-2 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule/70">
				{#each repositories as repository (repository.id)}
					{@const isPrimary = repository.id === primaryRepositoryId}
					<label
						class="flex min-h-10 items-center gap-3 bg-surface px-3.5 text-sm {isPrimary
							? 'cursor-not-allowed text-ink-faint'
							: ''}"
					>
						<input
							type="checkbox"
							name="relatedRepositoryIds"
							value={repository.id}
							bind:group={relatedRepositoryIds}
							disabled={isPrimary}
							class="size-4 accent-accent disabled:opacity-50"
						/>
						<span class="min-w-0 truncate">
							<span translate="no">{repository.fullName}</span>
							{#if isPrimary}<span> (primary)</span>{/if}
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
			{pending === 'save' ? 'Saving service…' : 'Save service'}
		</Button>
	</form>
	<div class="border-t border-rule pt-6">
		<p class="text-sm text-ink-muted">Rotating immediately revokes the current ingestion key.</p>
		<form
			method="POST"
			action="?/rotate"
			use:enhance={({ cancel }) => {
				if (
					!window.confirm(
						'Rotate this ingestion key? The current key will stop working immediately.'
					)
				) {
					cancel();
					return;
				}
				message = '';
				error = '';
				revealedKey = null;
				pending = 'rotate';
				return async ({ result, update }) => {
					pending = null;
					if (result.type === 'failure') {
						error =
							typeof result.data?.detail === 'string' ? result.data.detail : 'Unable to rotate key';
						return;
					}
					if (result.type === 'success') {
						revealedKey =
							typeof result.data?.ingestionKey === 'string' ? result.data.ingestionKey : null;
					}
					await update();
				};
			}}
		>
			<Button type="submit" variant="outline" class="mt-3" disabled={pending !== null}>
				{pending === 'rotate' ? 'Rotating key…' : 'Rotate ingestion key'}
			</Button>
		</form>
		{#if revealedKey}
			<div class="mt-4 rounded-lg bg-warning/10 p-4">
				<p class="text-sm font-medium text-warning">
					Copy this key now. It will not be shown again.
				</p>
				<code translate="no" class="mt-2 block overflow-x-auto text-xs text-ink">
					{revealedKey}
				</code>
			</div>
		{/if}
	</div>
</div>
