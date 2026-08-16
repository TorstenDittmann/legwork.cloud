<script lang="ts">
	import {
		ArrowRight,
		Check,
		Eye,
		FileSearch,
		GitCommitHorizontal,
		LockKeyhole,
		ShieldCheck,
		TimerReset
	} from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');
	const startHref = $derived(data.authState === 'onboarded' ? '/dashboard' : '/onboarding');

	const capabilities = [
		[
			GitCommitHorizontal,
			'Exact revisions',
			'Every investigation is pinned to immutable commit SHAs.'
		],
		[
			ShieldCheck,
			'Fail-closed execution',
			'Approved checks run offline inside a disposable sandbox.'
		],
		[
			FileSearch,
			'Verifiable evidence',
			'Every conclusion cites inspected source with exact line ranges.'
		],
		[Eye, 'Explicit limits', 'Uncertainty and unavailable checks stay visible in the final record.']
	] as const;
	const security = [
		[LockKeyhole, 'Read-only GitHub App'],
		[TimerReset, 'Disposable Railway sandbox'],
		[Check, '30-day incident retention']
	] as const;
</script>

<main class="min-h-screen">
	<nav aria-label="Main">
		<div class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
			<a href="/" aria-label="OnCall AI home"><Wordmark /></a>
			<Button href={dashboardHref} variant="outline" size="sm">
				{signedIn ? 'Open dashboard' : 'Sign in'}
			</Button>
		</div>
	</nav>
	<section>
		<div
			class="mx-auto grid max-w-[1200px] items-center gap-14 px-5 pt-14 pb-20 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:pb-28"
		>
			<div>
				<Badge tone="accent">
					<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
					Read-only incident intelligence
				</Badge>
				<h1
					class="mt-6 max-w-3xl font-display text-5xl leading-[1.02] font-semibold tracking-[-0.02em] text-pretty text-ink sm:text-6xl xl:text-[76px]"
				>
					A diagnosis your on-call can <em class="text-accent">verify</em>.
				</h1>
				<p class="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
					Inspect exact source snapshots in isolated sandboxes. Return the root cause, the evidence,
					and the limits—without touching production.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button href={startHref} size="lg">
						Get started <ArrowRight aria-hidden="true" class="size-4" />
					</Button>
					<Button href={dashboardHref} size="lg" variant="ghost">Open dashboard</Button>
				</div>
			</div>
			<article class="w-full rounded-2xl border border-rule bg-surface shadow-hero">
				<header class="flex items-center justify-between border-b border-rule px-5 py-3.5">
					<span class="text-xs font-medium text-ink-faint">Investigation record #0427</span>
					<Badge tone="success">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
						Verified
					</Badge>
				</header>
				<div class="p-6 sm:p-8">
					<p class="flex items-center gap-2 text-xs font-medium text-high">
						<span aria-hidden="true" class="size-2 rounded-full bg-high"></span>
						High · Payment API
					</p>
					<h2
						class="mt-3 font-display text-2xl leading-snug font-semibold tracking-[-0.01em] text-ink"
					>
						Concurrent cache eviction interrupts active archive reads
					</h2>
					<p class="mt-4 border-l-2 border-accent pl-4 text-sm leading-6 text-ink-muted">
						The clear path removes the content-addressed store without coordinating with active
						readers.
					</p>
					<div class="mt-6 overflow-hidden rounded-lg border border-rule">
						<p
							class="border-b border-rule bg-surface px-3.5 py-2 font-mono text-[11px] text-accent"
						>
							E-01 · internal/cache/layers.go:94–107
						</p>
						<pre
							translate="no"
							class="bg-surface-raised px-3.5 py-3 font-mono text-[11px] leading-5 text-ink-muted">if err := os.RemoveAll(dir); err != nil &#123;</pre>
					</div>
					<dl class="mt-5 grid grid-cols-2 gap-3">
						<div class="rounded-lg bg-surface-raised px-3.5 py-3">
							<dt class="text-xs font-medium text-ink-faint">Revision</dt>
							<dd class="mt-1 truncate font-mono text-xs text-ink" translate="no">0fab160216e8</dd>
						</div>
						<div class="rounded-lg bg-surface-raised px-3.5 py-3">
							<dt class="text-xs font-medium text-ink-faint">Sandbox</dt>
							<dd class="mt-1 text-xs font-medium text-success">Destroyed</dd>
						</div>
					</dl>
				</div>
			</article>
		</div>
	</section>
	<section class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
		<div class="max-w-2xl">
			<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
				The operating model
			</h2>
			<p class="mt-3 text-base leading-7 text-ink-muted">
				A four-step pipeline that treats every claim as something you should be able to check.
			</p>
		</div>
		<ol class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each capabilities as [Icon, title, copy] (title)}
				<li class="rounded-xl border border-rule bg-surface p-6 shadow-card">
					<span
						aria-hidden="true"
						class="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent"
					>
						<Icon class="size-4.5" stroke-width={2} />
					</span>
					<h3 class="mt-4 text-base font-semibold text-ink">{title}</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">{copy}</p>
				</li>
			{/each}
		</ol>
	</section>
	<section class="border-y border-rule bg-surface">
		<div class="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
			<div>
				<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
					Evidence in. Nothing out.
				</h2>
				<p class="mt-4 max-w-lg text-base leading-7 text-ink-muted">
					Repository commands run with no DNS, HTTP, HTTPS, private-network, or metadata access.
					Sandboxes are temporary; installation credentials remain worker-only.
				</p>
			</div>
			<ul
				class="divide-y divide-rule self-start overflow-hidden rounded-xl border border-rule bg-surface shadow-card"
			>
				{#each security as [Icon, label] (label)}
					<li class="flex items-center gap-3 px-5 py-4 text-sm font-medium text-ink">
						<span
							aria-hidden="true"
							class="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"
						>
							<Icon class="size-4" stroke-width={2} />
						</span>
						{label}
					</li>
				{/each}
			</ul>
		</div>
	</section>
	<footer class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
		<div
			class="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-accent px-8 py-10 sm:px-12 sm:py-14"
		>
			<p
				class="max-w-xl font-display text-3xl font-semibold tracking-[-0.01em] text-pretty text-white sm:text-4xl"
			>
				Build a record, not a guess.
			</p>
			<Button
				href={startHref}
				size="lg"
				class="border-transparent bg-white text-accent shadow-none hover:bg-accent-soft"
			>
				Get started <ArrowRight aria-hidden="true" class="size-4" />
			</Button>
		</div>
	</footer>
</main>
