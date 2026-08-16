<script lang="ts">
	import { enhance } from '$app/forms';
	import { KeyRound, Laptop, Mail, ShieldCheck, UserRound } from '@lucide/svelte';
	import ConfirmSubmit from '$lib/components/confirm-submit.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import CardHeader from '$lib/components/ui/card-header.svelte';
	import CardTitle from '$lib/components/ui/card-title.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import InlineAlert from '$lib/components/ui/inline-alert.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import PageHeader from '$lib/components/ui/page-header.svelte';
	import { formatDateTime } from '$lib/utils';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const pendingEmail = $derived.by(() => {
		if (form?.action === 'requestEmailChange' && form.success) return form.pendingEmail;
		if (form?.action === 'confirmEmailChange' && !form.success) return form.pendingEmail;
		return '';
	});

	function authMethodLabel(authMethod: string) {
		const labels: Record<string, string> = {
			cross_app_auth: 'Cross-app auth',
			external_auth: 'External auth',
			impersonation: 'Impersonation',
			magic_code: 'Magic code',
			migrated_session: 'Migrated session',
			oauth: 'Social login',
			passkey: 'Passkey',
			password: 'Password',
			sso: 'Single sign-on',
			unknown: 'Unknown method'
		};
		return labels[authMethod] ?? authMethod.replaceAll('_', ' ');
	}

	function deviceLabel(userAgent: string | null) {
		if (!userAgent) return 'Unknown browser';
		const browser = userAgent.includes('Edg/')
			? 'Edge'
			: userAgent.includes('Chrome/')
				? 'Chrome'
				: userAgent.includes('Firefox/')
					? 'Firefox'
					: userAgent.includes('Safari/')
						? 'Safari'
						: 'Browser';
		const device = userAgent.includes('iPhone')
			? 'iPhone'
			: userAgent.includes('iPad')
				? 'iPad'
				: userAgent.includes('Android')
					? 'Android'
					: userAgent.includes('Mac OS X')
						? 'Mac'
						: userAgent.includes('Windows')
							? 'Windows'
							: userAgent.includes('Linux')
								? 'Linux'
								: 'unknown device';
		return `${browser} on ${device}`;
	}
</script>

<PageHeader
	eyebrow="Personal"
	title="Account"
	description="Manage your profile, password recovery, and active sessions. These settings apply to you across every workspace."
/>

<div class="mt-8 grid gap-5 xl:grid-cols-2">
	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<div class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
					<UserRound aria-hidden="true" class="size-4" />
				</div>
				<div>
					<CardTitle>Profile</CardTitle>
					<p class="mt-1 text-xs text-ink-faint">Shown anywhere your identity is displayed.</p>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			{#if form?.action === 'updateProfile'}
				<InlineAlert tone={form.success ? 'success' : 'danger'}>{form.message}</InlineAlert>
			{/if}
			<form method="POST" action="?/updateProfile" class="mt-5 space-y-5" use:enhance>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field label="First name" forId="account-first-name">
						<Input
							id="account-first-name"
							name="firstName"
							autocomplete="given-name"
							maxlength={100}
							value={form?.action === 'updateProfile'
								? form.firstName
								: (data.profile.firstName ?? '')}
						/>
					</Field>
					<Field label="Last name" forId="account-last-name">
						<Input
							id="account-last-name"
							name="lastName"
							autocomplete="family-name"
							maxlength={100}
							value={form?.action === 'updateProfile'
								? form.lastName
								: (data.profile.lastName ?? '')}
						/>
					</Field>
				</div>
				<Button type="submit">Save profile</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<div class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
					<Mail aria-hidden="true" class="size-4" />
				</div>
				<div>
					<CardTitle>Email address</CardTitle>
					<p class="mt-1 text-xs text-ink-faint">Used to sign in and receive account email.</p>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			<div class="flex flex-wrap items-center gap-2">
				<span translate="no" class="text-sm font-medium text-ink">{data.profile.email}</span>
				<Badge tone={data.profile.emailVerified ? 'success' : 'warning'}>
					{data.profile.emailVerified ? 'Verified' : 'Unverified'}
				</Badge>
			</div>

			{#if form?.action === 'requestEmailChange'}
				<div class="mt-5">
					<InlineAlert tone={form.success ? 'success' : 'danger'}>{form.message}</InlineAlert>
				</div>
			{:else if form?.action === 'confirmEmailChange'}
				<div class="mt-5">
					<InlineAlert tone={form.success ? 'success' : 'danger'}>{form.message}</InlineAlert>
				</div>
			{/if}

			{#if pendingEmail}
				<form method="POST" action="?/confirmEmailChange" class="mt-5 space-y-4" use:enhance>
					<input type="hidden" name="pendingEmail" value={pendingEmail} />
					<Field
						label="Verification code"
						forId="account-email-code"
						hint={`Enter the code sent to ${pendingEmail}.`}
					>
						<Input
							id="account-email-code"
							name="code"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							pattern="[0-9]{6}"
							maxlength={6}
							required
							class="max-w-48 font-mono tracking-[0.2em]"
						/>
					</Field>
					<div class="flex flex-wrap gap-2">
						<Button type="submit">Confirm email</Button>
						<Button
							type="submit"
							formaction="?/requestEmailChange"
							name="email"
							value={pendingEmail}
							variant="outline"
						>
							Send a new code
						</Button>
					</div>
				</form>
			{:else}
				<form method="POST" action="?/requestEmailChange" class="mt-5 space-y-4" use:enhance>
					<Field
						label="New email"
						forId="account-new-email"
						hint="We'll verify the new address before changing it. Enterprise-managed addresses must be changed in your identity provider."
					>
						<Input
							id="account-new-email"
							name="email"
							type="email"
							autocomplete="email"
							spellcheck="false"
							maxlength={254}
							required
							value={form?.action === 'requestEmailChange' ? form.pendingEmail : ''}
						/>
					</Field>
					<Button type="submit" variant="outline">Change email</Button>
				</form>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<div class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
					<KeyRound aria-hidden="true" class="size-4" />
				</div>
				<div>
					<CardTitle>Password</CardTitle>
					<p class="mt-1 text-xs text-ink-faint">Reset your password securely.</p>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			{#if form?.action === 'sendPasswordReset'}
				<InlineAlert tone={form.success ? 'success' : 'danger'}>{form.message}</InlineAlert>
			{/if}
			<p class="mt-5 text-sm leading-6 text-ink-muted">
				We'll send a secure reset link to
				<span translate="no" class="font-medium text-ink">{data.profile.email}</span>. Completing
				the reset ends all active sessions.
			</p>
			<form method="POST" action="?/sendPasswordReset" class="mt-5" use:enhance>
				<Button type="submit" variant="outline">Email reset link</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<div class="flex items-center gap-3">
				<div class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
					<ShieldCheck aria-hidden="true" class="size-4" />
				</div>
				<div>
					<CardTitle>Account security</CardTitle>
					<p class="mt-1 text-xs text-ink-faint">Your sign-in protections stay in place.</p>
				</div>
			</div>
		</CardHeader>
		<CardContent>
			<p class="text-sm leading-6 text-ink-muted">
				Sign-in methods, organization SSO policies, and any required multi-factor authentication are
				applied automatically. Your organization administrator may enforce additional controls.
			</p>
		</CardContent>
	</Card>
</div>

<section class="mt-10">
	<div class="mb-4 flex items-end justify-between gap-4">
		<div>
			<h2 class="font-display text-xl font-semibold text-ink">Active sessions</h2>
			<p class="mt-1 text-sm text-ink-muted">Review browsers signed in to your account.</p>
		</div>
		<Badge>{data.sessions.length} active</Badge>
	</div>
	{#if form?.action === 'revokeSession'}
		<div class="mb-4">
			<InlineAlert tone={form.success ? 'success' : 'danger'}>{form.message}</InlineAlert>
		</div>
	{/if}
	<Card>
		<CardContent class="divide-y divide-rule py-1">
			{#each data.sessions as session (session.id)}
				<div class="flex flex-wrap items-center justify-between gap-4 py-5">
					<div class="flex min-w-0 items-start gap-3">
						<div
							class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-raised text-ink-muted"
						>
							<Laptop aria-hidden="true" class="size-4" />
						</div>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-sm font-medium text-ink" title={session.userAgent ?? undefined}>
									{deviceLabel(session.userAgent)}
								</p>
								{#if session.current}<Badge tone="accent">Current session</Badge>{/if}
							</div>
							<p class="mt-1 text-xs leading-5 text-ink-faint">
								{authMethodLabel(session.authMethod)} · {session.ipAddress ?? 'Unknown IP'} · Started
								{formatDateTime(session.createdAt)}
							</p>
							<p class="text-xs leading-5 text-ink-faint">
								Expires {formatDateTime(session.expiresAt)}
							</p>
						</div>
					</div>
					{#if !session.current}
						<form method="POST" action="?/revokeSession" use:enhance>
							<input type="hidden" name="sessionId" value={session.id} />
							<ConfirmSubmit message="Revoke this session? The device will need to sign in again.">
								Revoke
							</ConfirmSubmit>
						</form>
					{/if}
				</div>
			{/each}
		</CardContent>
	</Card>
</section>
