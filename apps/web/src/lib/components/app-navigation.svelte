<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Bell,
		GitBranch,
		LayoutDashboard,
		LogOut,
		Menu,
		Radio,
		Settings,
		Siren,
		Unplug,
		UserRound,
		X
	} from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import { cn } from '$lib/utils';

	const links = [
		['/dashboard', LayoutDashboard, 'Overview'],
		['/incidents', Siren, 'Incidents'],
		['/services', Radio, 'Services'],
		['/repositories', GitBranch, 'Repositories'],
		['/connections', Unplug, 'Connections'],
		['/notifications', Bell, 'Notifications'],
		['/settings', Settings, 'Settings']
	] as const;

	let {
		organizations,
		organizationId,
		email
	}: {
		organizations: Array<{ id: string; name: string }>;
		organizationId: string;
		email?: string | null;
	} = $props();

	let open = $state(false);
	let dialog = $state<HTMLElement>();
	let closeButton = $state<HTMLButtonElement>();
	const navigationTriggerId = 'mobile-navigation-trigger';

	const pathname = $derived(page.url.pathname);
	const current = $derived(
		pathname.startsWith('/account')
			? 'Account'
			: (links.find(([href]) => pathname.startsWith(href))?.[2] ?? 'Overview')
	);

	afterNavigate(() => {
		open = false;
	});

	function close() {
		open = false;
		requestAnimationFrame(() => {
			const trigger = document.getElementById(navigationTriggerId);
			if (trigger instanceof HTMLButtonElement) trigger.focus();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			close();
			return;
		}
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => !element.hidden);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;
		const main = document.getElementById('main-content');
		const mobileHeader = document.querySelector<HTMLElement>('[data-mobile-header]');
		document.body.style.overflow = 'hidden';
		if (main) main.inert = true;
		if (mobileHeader) mobileHeader.inert = true;
		requestAnimationFrame(() => closeButton?.focus());
		return () => {
			document.body.style.overflow = '';
			if (main) main.inert = false;
			if (mobileHeader) mobileHeader.inert = false;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet nav()}
	<div class="px-5 pt-5 pb-4">
		<a href="/dashboard" aria-label="Legwork dashboard"><Wordmark /></a>
	</div>
	{#if organizations.length > 0}
		<form action="/switch-organization" method="POST" class="px-4 pb-4">
			<label for="organizationId" class="mb-1.5 block text-xs font-medium text-ink-faint">
				Workspace
			</label>
			<Select
				id="organizationId"
				name="organizationId"
				value={organizationId}
				class="text-xs sm:h-9"
			>
				{#each organizations as { id, name } (id)}
					<option value={id}>{name}</option>
				{/each}
			</Select>
			<Button type="submit" size="sm" variant="ghost" class="mt-1.5 w-full">Switch workspace</Button
			>
		</form>
	{/if}
	<nav aria-label="Primary" class="flex-1 px-3 py-2">
		{#each links as [href, Icon, label] (href)}
			{@const active = pathname.startsWith(href)}
			<a
				{href}
				aria-current={active ? 'page' : undefined}
				class={cn(
					'mb-0.5 flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-[color,background-color]',
					active
						? 'bg-accent-soft font-medium text-accent-hover'
						: 'text-ink-muted hover:bg-surface-raised hover:text-ink'
				)}
			>
				<Icon aria-hidden="true" class="size-4" />
				{label}
			</a>
		{/each}
	</nav>
	<div class="border-t border-rule px-4 py-4">
		<a
			href="/account"
			aria-current={pathname.startsWith('/account') ? 'page' : undefined}
			class={cn(
				'flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-1.5 transition-[color,background-color]',
				pathname.startsWith('/account')
					? 'bg-accent-soft text-accent-hover'
					: 'text-ink-muted hover:bg-surface-raised hover:text-ink'
			)}
		>
			<UserRound aria-hidden="true" class="size-4 shrink-0" />
			<span class="min-w-0">
				<span class="block text-xs font-medium">Account</span>
				<span class="block truncate text-[11px] text-ink-faint">{email}</span>
			</span>
		</a>
		<form action="/sign-out" method="POST">
			<Button type="submit" variant="ghost" size="sm" class="mt-1.5 w-full justify-start">
				<LogOut aria-hidden="true" class="size-3.5" />
				Sign out
			</Button>
		</form>
	</div>
{/snippet}

<header
	data-mobile-header
	class="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-rule bg-surface/90 px-4 backdrop-blur lg:hidden"
>
	<a href="/dashboard" aria-label="Legwork dashboard"><Wordmark /></a>
	<div class="flex items-center gap-3">
		<span class="text-xs text-ink-muted">{current}</span>
		<button
			id={navigationTriggerId}
			type="button"
			aria-label="Open navigation"
			aria-expanded={open}
			aria-controls="mobile-navigation-dialog"
			onclick={() => (open = true)}
			class="grid size-10 place-items-center rounded-lg border border-rule-strong bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
		>
			<Menu aria-hidden="true" class="size-4" />
		</button>
	</div>
</header>
<aside class="sticky top-0 hidden h-screen flex-col border-r border-rule bg-surface lg:flex">
	{@render nav()}
</aside>
{#if open}
	<div class="fixed inset-0 z-50 overscroll-contain lg:hidden">
		<button
			type="button"
			aria-label="Close navigation"
			class="absolute inset-0 bg-black/40"
			onclick={close}
		></button>
		<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
		<aside
			id="mobile-navigation-dialog"
			bind:this={dialog}
			role="dialog"
			aria-modal="true"
			aria-label="Navigation"
			class="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-rule bg-surface pb-[env(safe-area-inset-bottom)] shadow-lift"
		>
			<button
				bind:this={closeButton}
				type="button"
				aria-label="Close navigation"
				onclick={close}
				class="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
			>
				<X aria-hidden="true" class="size-4" />
			</button>
			{@render nav()}
		</aside>
	</div>
{/if}
