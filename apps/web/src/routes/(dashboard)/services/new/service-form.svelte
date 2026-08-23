<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/button.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import type { ActionData } from './$types';

	let {
		repositories,
		form
	}: { repositories: Array<{ id: string; fullName: string }>; form: ActionData } = $props();

	let pending = $state(false);
	let copied = $state('');
	// Intentional form-local seed; repository options do not change while this form is mounted.
	// svelte-ignore state_referenced_locally
	let primaryRepositoryId = $state(repositories[0]?.id ?? '');
	let relatedRepositoryIds = $state<string[]>([]);

	const revealed = $derived(
		form?.ingestionKey && form.callbackSigningSecret
			? { ingestionKey: form.ingestionKey, callbackSigningSecret: form.callbackSigningSecret }
			: null
	);
	const error = $derived(form?.detail ?? '');

	async function copy(label: string, value: string) {
		await navigator.clipboard.writeText(value);
		copied = label;
	}

	function removePrimaryFromRelated() {
		relatedRepositoryIds = relatedRepositoryIds.filter(
			(repositoryId) => repositoryId !== primaryRepositoryId
		);
	}
</script>

{#if revealed}
	{@const secrets = [
		['Ingestion Key', revealed.ingestionKey],
		['Callback Secret', revealed.callbackSigningSecret]
	] as Array<[string, string]>}
	<div class="max-w-2xl rounded-xl border border-rule bg-surface p-6 shadow-card sm:p-8">
		<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
			Copy these secrets now
		</h2>
		<p class="mt-2 text-sm text-warning">They will not be shown again.</p>
		<div class="mt-5 space-y-3">
			{#each secrets as [label, value] (label)}
				<div class="rounded-lg border border-rule bg-surface-raised p-4">
					<p class="text-xs font-medium text-ink-faint">
						{label}
					</p>
					<code translate="no" class="mt-2 block overflow-x-auto text-xs text-ink-muted">
						{value}
					</code>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						class="mt-2"
						onclick={() => copy(label, value)}
					>
						{copied === label ? 'Copied' : `Copy ${label}`}
					</Button>
				</div>
			{/each}
		</div>
		<p aria-live="polite" class="sr-only">
			{copied ? `${copied} copied` : ''}
		</p>
		<Button class="mt-5" onclick={() => goto('/services')}>Open services</Button>
	</div>
{:else}
	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				pending = false;
				await update();
			};
		}}
		class="max-w-2xl space-y-5"
	>
		<Field label="Name" forId="name">
			<Input id="name" name="name" autocomplete="off" required />
		</Field>
		<Field
			label="Slug"
			forId="slug"
			hint="Stable lowercase identifier used by the ingestion endpoint."
		>
			<Input
				id="slug"
				name="slug"
				autocomplete="off"
				spellcheck="false"
				required
				pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
			/>
		</Field>
		<Field label="Primary repository" forId="primaryRepositoryId">
			<Select
				id="primaryRepositoryId"
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
		<Field
			label="Callback HTTPS URL"
			forId="callbackUrl"
			hint="Optional delivery target for completed diagnoses."
		>
			<Input
				id="callbackUrl"
				name="callbackUrl"
				type="url"
				autocomplete="url"
				placeholder="https://ops.example.com/incidents…"
			/>
		</Field>
		{#if error}
			<InlineAlert tone="danger">{error}</InlineAlert>
		{/if}
		<Button type="submit" disabled={pending}>
			{pending ? 'Creating service…' : 'Create service & reveal keys'}
		</Button>
	</form>
{/if}
