<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Button from '$lib/components/ui/button.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Select from '$lib/components/ui/select.svelte';

	let { repositories }: { repositories: Array<{ id: string; fullName: string }> } = $props();

	let revealed = $state<{ ingestionKey: string; callbackSigningSecret: string } | null>(null);
	let error = $state('');
	let pending = $state(false);
	let copied = $state('');

	async function copy(label: string, value: string) {
		await navigator.clipboard.writeText(value);
		copied = label;
	}

	async function submit(event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement }) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		error = '';
		pending = true;
		const response = await fetch('/api/services', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: form.get('name'),
				slug: form.get('slug'),
				primaryRepositoryId: form.get('primaryRepositoryId'),
				relatedRepositoryIds: form.getAll('relatedRepositoryIds').filter(Boolean),
				callbackUrl: form.get('callbackUrl') || undefined,
				enabled: true
			})
		});
		const body = await response.json();
		if (!response.ok) {
			error = body.detail ?? 'Unable to create service';
			pending = false;
			return;
		}
		revealed = {
			ingestionKey: body.ingestionKey,
			callbackSigningSecret: body.callbackSigningSecret
		};
		await invalidateAll();
	}
</script>

{#if revealed}
	{@const secrets = [
		['Ingestion Key', revealed.ingestionKey],
		['Callback Secret', revealed.callbackSigningSecret]
	] as Array<[string, string]>}
	<div
		class="max-w-2xl rounded-[4px] border border-l-2 border-rule border-l-warning bg-surface p-6 shadow-[0_1px_2px_rgba(23,26,32,0.04)]"
	>
		<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
			Copy These Secrets Now
		</h2>
		<p class="mt-2 text-sm text-warning">They will not be shown again.</p>
		<div class="mt-5 space-y-3">
			{#each secrets as [label, value] (label)}
				<div class="rounded-[3px] border border-rule bg-surface-raised p-4">
					<p class="font-mono text-[9px] tracking-[0.08em] text-ink-faint uppercase">
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
		<Button class="mt-5" onclick={() => goto('/services')}>Open Services</Button>
	</div>
{:else}
	<form onsubmit={submit} class="max-w-2xl space-y-5">
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
		<Field label="Primary Repository" forId="primaryRepositoryId">
			<Select id="primaryRepositoryId" name="primaryRepositoryId" required>
				{#each repositories as repository (repository.id)}
					<option value={repository.id}>{repository.fullName}</option>
				{/each}
			</Select>
		</Field>
		<fieldset>
			<legend class="text-xs font-medium">
				Related Repositories <span class="text-ink-faint">(up to 2)</span>
			</legend>
			<div class="mt-2 grid gap-px overflow-hidden rounded-[3px] border border-rule bg-rule">
				{#each repositories as repository (repository.id)}
					<label class="flex min-h-10 items-center gap-3 bg-surface px-3 text-sm">
						<input
							type="checkbox"
							name="relatedRepositoryIds"
							value={repository.id}
							class="size-4 accent-accent"
						/>
						<span translate="no" class="min-w-0 truncate">
							{repository.fullName}
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
			{pending ? 'Creating Service…' : 'Create Service & Reveal Keys'}
		</Button>
	</form>
{/if}
