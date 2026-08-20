<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmSubmit from '$lib/components/confirm-submit.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import SectionHeader from '$lib/components/ui/section-header.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import { planName } from '$lib/pricing';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const pendingInvitations = $derived(
		data.invitations.filter((invitation) => invitation.state === 'pending')
	);

	function truncateId(value: string): string {
		return value.length > 10 ? `${value.slice(0, 10)}…` : value;
	}

	function auditActor(event: { actorEmail: string | null; actorId: string | null }): string {
		if (event.actorEmail) return event.actorEmail;
		if (event.actorId) return truncateId(event.actorId);
		return 'system';
	}

	function auditMetadata(metadata: Record<string, string | number | boolean | null>): string {
		return Object.entries(metadata)
			.map(([key, value]) => `${key}: ${value ?? '—'}`)
			.join(' · ');
	}
</script>

<PageHeader
	eyebrow="Organization"
	title="Settings"
	description="Manage usage, billing, access, credentials, and the organization audit record."
/>
<div class="mt-8 grid gap-5 lg:grid-cols-3">
	<Card>
		<CardHeader>
			<CardTitle>Monthly usage</CardTitle>
		</CardHeader>
		<CardContent>
			<p class="text-sm text-ink-muted tabular-nums">
				{data.usage.analyses} / {data.monthlyAnalysisQuota} analyses
			</p>
			<div
				role="progressbar"
				aria-label="Monthly analyses used"
				aria-valuemin={0}
				aria-valuemax={data.monthlyAnalysisQuota}
				aria-valuenow={data.usage.analyses}
				class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised"
			>
				<div
					class="h-full rounded-full bg-accent"
					style={`width: ${Math.min(100, (data.usage.analyses / data.monthlyAnalysisQuota) * 100)}%`}
				></div>
			</div>
			<p class="mt-4 text-sm text-ink-muted tabular-nums">
				{new Intl.NumberFormat('en').format(data.usage.tokens)} /
				{new Intl.NumberFormat('en').format(data.monthlyTokenQuota)}
				model tokens
			</p>
		</CardContent>
	</Card>
	<Card>
		<CardHeader>
			<CardTitle>Plan & billing</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-sm font-medium text-ink">
						{data.billing ? planName(data.billing.plan) : 'Developer'}
					</p>
					<p class="mt-1 text-xs text-ink-faint capitalize">
						{data.billing
							? `${data.billing.status.replace('_', ' ')} · ${data.billing.billingInterval}ly`
							: 'Free plan'}
					</p>
				</div>
				{#if data.billing?.cancelAtPeriodEnd}
					<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-warning">
						Cancels at period end
					</span>
				{/if}
			</div>
			{#if data.billing?.currentPeriodEnd}
				<p class="mt-4 text-xs text-ink-faint">
					Current period ends {formatDateTime(data.billing.currentPeriodEnd)}
				</p>
			{/if}
			{#if data.role === 'admin' && data.billing}
				<Button href="/billing/portal" variant="outline" size="sm" class="mt-5">
					Manage billing
				</Button>
			{:else if !data.billing}
				<Button href="/pricing" variant="outline" size="sm" class="mt-5">Compare plans</Button>
			{/if}
		</CardContent>
	</Card>
	<Card>
		<CardHeader>
			<CardTitle>Active API keys</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3">
			{#if data.keys.length === 0}
				<EmptyState title="No active keys">
					API keys are issued per service. Open a service to create or rotate its key.
				</EmptyState>
			{:else}
				{#each data.keys as key (`${key.serviceName}:${key.prefix}`)}
					<div class="text-sm">
						<span class="text-ink-muted">{key.serviceName}</span>
						<code translate="no" class="ml-3 text-xs text-ink-faint">{key.prefix}…</code>
					</div>
				{/each}
			{/if}
		</CardContent>
	</Card>
</div>
{#if data.role === 'admin'}
	<section class="mt-10">
		<SectionHeader>Members & invitations</SectionHeader>
		{#if form?.message}
			<p class="mb-4 text-sm text-danger">{form.message}</p>
		{/if}
		<form method="POST" action="?/inviteMember" class="mb-4 flex max-w-xl gap-2" use:enhance>
			<Field label="Email" forId="invite-email" class="flex-1">
				<Input
					id="invite-email"
					name="email"
					type="email"
					autocomplete="email"
					spellcheck="false"
					required
					placeholder="teammate@example.com…"
				/>
			</Field>
			<Field label="Role" forId="invite-role">
				<Select id="invite-role" name="role">
					<option value="member">Member</option>
					<option value="admin">Admin</option>
				</Select>
			</Field>
			<Button type="submit" class="mt-6">Invite member</Button>
		</form>
		<Card>
			<CardContent class="divide-y divide-rule pt-6">
				{#each data.memberships as membership (membership.id)}
					<div class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
						<span translate="no" class="text-ink-muted">{membership.email}</span>
						<div class="flex gap-2">
							<form method="POST" action="?/changeMemberRole" use:enhance>
								<input type="hidden" name="membershipId" value={membership.id} />
								<select
									name="role"
									class="h-8 rounded-lg border border-rule-strong bg-surface px-2 text-xs"
								>
									<option value="member" selected={membership.role === 'member'}>Member</option>
									<option value="admin" selected={membership.role === 'admin'}>Admin</option>
								</select>
								<Button type="submit" size="sm" variant="ghost">Update</Button>
							</form>
							<form method="POST" action="?/removeMember" use:enhance>
								<input type="hidden" name="membershipId" value={membership.id} />
								<input type="hidden" name="userId" value={membership.userId} />
								<ConfirmSubmit
									message="Remove this member from the organization? They will immediately lose access."
								>
									Remove member
								</ConfirmSubmit>
							</form>
						</div>
					</div>
				{/each}
				{#each pendingInvitations as invitation (invitation.id)}
					<div class="flex justify-between py-3 text-sm text-ink-muted">
						<span>{invitation.email}</span>
						<span>invited · {invitation.roleSlug}</span>
					</div>
				{/each}
			</CardContent>
		</Card>
	</section>
{/if}
<section class="mt-10">
	<SectionHeader>Audit events</SectionHeader>
	<Card>
		<CardContent class="divide-y divide-rule pt-6">
			{#each data.audits.rows as event (event.id)}
				{@const metadata = auditMetadata(event.metadata)}
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
					<div class="min-w-0">
						<p class="flex flex-wrap items-baseline gap-x-2">
							<span translate="no" class="text-xs text-ink-faint">{auditActor(event)}</span>
							<span class="text-ink-muted">{event.action}</span>
							<span translate="no" class="text-xs text-ink-faint">
								{event.targetType}{event.targetId ? ` ${truncateId(event.targetId)}` : ''}
							</span>
						</p>
						{#if metadata}
							<p translate="no" class="mt-0.5 truncate text-xs text-ink-faint">{metadata}</p>
						{/if}
					</div>
					<time class="font-mono text-xs text-ink-faint">
						{formatDateTime(event.createdAt)}
					</time>
				</div>
			{/each}
		</CardContent>
	</Card>
	{#if data.audits.rows.length === 0}
		<EmptyState title="No audit events">Organization changes will appear here.</EmptyState>
	{/if}
	{#if data.audits.pageCount > 1}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
			<p class="text-xs text-ink-faint tabular-nums">
				Page {data.audits.page} of {data.audits.pageCount} · {data.audits.total} events
			</p>
			<div class="flex gap-2">
				{#if data.audits.page > 1}
					<Button
						href={data.audits.page === 2 ? '/settings' : `?auditPage=${data.audits.page - 1}`}
						variant="outline"
						size="sm"
					>
						Previous
					</Button>
				{/if}
				{#if data.audits.page < data.audits.pageCount}
					<Button href={`?auditPage=${data.audits.page + 1}`} variant="outline" size="sm">
						Next
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</section>
<p class="mt-10 max-w-3xl border-t border-rule pt-6 text-xs leading-5 text-ink-faint">
	Selected incident context and requested code excerpts are processed through OpenRouter and its
	routed model provider. Provider privacy filtering is deferred for the MVP. Active incident data
	expires after 30 days. Operational state is stored in the organization-scoped Bun SQLite database.
</p>
