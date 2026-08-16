<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmSubmit from '$lib/components/confirm-submit.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const kinds = {
		slack: {
			label: 'Slack',
			field: 'Incoming webhook URL',
			placeholder: 'https://hooks.slack.com/services/T0.../B0.../xxxx',
			help: 'Slack → your app → Incoming Webhooks → Add New Webhook to Workspace.'
		},
		discord: {
			label: 'Discord',
			field: 'Webhook URL',
			placeholder: 'https://discord.com/api/webhooks/123.../xxxx',
			help: 'Discord → channel settings → Integrations → Webhooks → New Webhook.'
		},
		email: {
			label: 'Email',
			field: 'Recipient address',
			placeholder: 'oncall@example.com',
			help: 'Delivered from Legwork. Distribution lists work well here.'
		}
	} as const;

	const events = [
		['analysis.completed', 'Diagnosis ready'],
		['analysis.inconclusive', 'Inconclusive'],
		['analysis.failed', 'Failed']
	] as const;

	let kind = $state<keyof typeof kinds>('slack');
	const selected = $derived(kinds[kind]);

	function routingLabel(serviceIds: string[]) {
		if (serviceIds.length === 0) return 'All services';
		return serviceIds.length === 1 ? '1 service' : `${serviceIds.length} services`;
	}
</script>

<PageHeader
	eyebrow="Organization"
	title="Notifications"
	description="Send each finished analysis to Slack, Discord, or email."
/>

{#if form?.message}
	<div class="mt-6">
		<InlineAlert tone={form.tone === 'danger' ? 'danger' : 'success'}>
			{form.message}
		</InlineAlert>
	</div>
{/if}

<section class="mt-8">
	<SectionHeader>Channels</SectionHeader>
	{#if data.channels.length === 0}
		<EmptyState title="No channels yet">
			Add a channel below and a diagnosis will reach your team without opening the dashboard.
		</EmptyState>
	{:else}
		<Card>
			<CardContent class="divide-y divide-rule pt-6">
				{#each data.channels as channel (channel.id)}
					<div class="flex flex-wrap items-center justify-between gap-3 py-4">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<Badge tone="accent">{kinds[channel.kind].label}</Badge>
								<span class="text-sm font-medium text-ink">{channel.name}</span>
								{#if !channel.enabled}
									<Badge tone="neutral">Paused</Badge>
								{:else if channel.lastVerificationError}
									<Badge tone="danger">Failing</Badge>
								{:else if channel.lastVerifiedAt}
									<Badge tone="success">Verified</Badge>
								{:else}
									<Badge tone="warning">Untested</Badge>
								{/if}
							</div>
							<p translate="no" class="mt-1.5 truncate font-mono text-xs text-ink-faint">
								{channel.destinationHint}
							</p>
							<p class="mt-1 text-xs text-ink-muted">
								{routingLabel(channel.serviceIds)} · {channel.events.length} of 3 events
								{#if channel.lastVerifiedAt}
									· last delivered {formatDateTime(channel.lastVerifiedAt)}
								{/if}
							</p>
							{#if channel.lastVerificationError}
								<p class="mt-1 text-xs text-danger">{channel.lastVerificationError}</p>
							{/if}
						</div>
						{#if data.role === 'admin'}
							<div class="flex flex-wrap items-center gap-2">
								<form method="POST" action="?/sendTest" use:enhance>
									<input type="hidden" name="channelId" value={channel.id} />
									<Button type="submit" size="sm" variant="ghost">Send test</Button>
								</form>
								<form method="POST" action="?/toggleChannel" use:enhance>
									<input type="hidden" name="channelId" value={channel.id} />
									<input type="hidden" name="enabled" value={channel.enabled ? 'false' : 'true'} />
									<Button type="submit" size="sm" variant="ghost">
										{channel.enabled ? 'Pause' : 'Resume'}
									</Button>
								</form>
								<form method="POST" action="?/deleteChannel" use:enhance>
									<input type="hidden" name="channelId" value={channel.id} />
									<ConfirmSubmit
										message="Remove this channel? Analyses will stop being delivered to it."
									>
										Remove
									</ConfirmSubmit>
								</form>
							</div>
						{/if}
					</div>
				{/each}
			</CardContent>
		</Card>
	{/if}
</section>

{#if data.role === 'admin'}
	<section class="mt-10">
		<SectionHeader>Add a channel</SectionHeader>
		<Card>
			<CardContent class="pt-6">
				<form method="POST" action="?/createChannel" class="grid gap-5" use:enhance>
					<div class="grid gap-5 sm:grid-cols-2">
						<Field label="Type" forId="kind">
							<Select id="kind" name="kind" bind:value={kind}>
								{#each Object.entries(kinds) as [value, meta] (value)}
									<option {value}>{meta.label}</option>
								{/each}
							</Select>
						</Field>
						<Field label="Name" forId="name">
							<Input id="name" name="name" required placeholder="#incidents" maxlength={128} />
						</Field>
					</div>

					<Field label={selected.field} forId="destination" hint={selected.help}>
						<Input
							id="destination"
							name="destination"
							required
							spellcheck="false"
							autocomplete="off"
							placeholder={selected.placeholder}
						/>
					</Field>

					<fieldset>
						<legend class="mb-2 text-xs font-medium text-ink-faint">Notify on</legend>
						<div class="flex flex-wrap gap-4">
							{#each events as [value, label] (value)}
								<label class="flex items-center gap-2 text-sm text-ink-muted">
									<input type="checkbox" name="events" {value} checked class="accent-accent" />
									{label}
								</label>
							{/each}
						</div>
					</fieldset>

					<fieldset>
						<legend class="mb-2 text-xs font-medium text-ink-faint">
							Services (leave empty for all)
						</legend>
						{#if data.services.length === 0}
							<p class="text-sm text-ink-faint">No services yet.</p>
						{:else}
							<div class="flex flex-wrap gap-4">
								{#each data.services as service (service.id)}
									<label class="flex items-center gap-2 text-sm text-ink-muted">
										<input
											type="checkbox"
											name="serviceIds"
											value={service.id}
											class="accent-accent"
										/>
										{service.name}
									</label>
								{/each}
							</div>
						{/if}
					</fieldset>

					<div>
						<Button type="submit">Add channel</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	</section>
{/if}
