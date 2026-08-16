<script lang="ts">
	import { ArrowRight, Check, LockKeyhole, TimerReset } from '@lucide/svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');
	const startHref = $derived(data.authState === 'onboarded' ? '/dashboard' : '/onboarding');

	const capabilities = [
		['01', 'Exact revisions', 'Every investigation is pinned to immutable commit SHAs.'],
		['02', 'Fail-closed execution', 'Approved checks run offline inside a disposable sandbox.'],
		[
			'03',
			'Verifiable evidence',
			'Every conclusion cites inspected source with exact line ranges.'
		],
		[
			'04',
			'Explicit limits',
			'Uncertainty and unavailable checks stay visible in the final record.'
		]
	] as const;
	const security = [
		[LockKeyhole, 'Read-only GitHub App'],
		[TimerReset, 'Disposable Railway sandbox'],
		[Check, '30-day incident retention']
	] as const;
</script>

<main class="min-h-screen">
	<nav aria-label="Main" class="border-b border-rule bg-surface">
		<div class="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8">
			<a href="/" class="font-display text-lg font-semibold tracking-[-0.01em]">
				OnCall <span class="text-accent">AI</span>
			</a>
			<Button href={dashboardHref} variant="outline" size="sm">
				{signedIn ? 'Open Dashboard' : 'Sign In'}
			</Button>
		</div>
	</nav>
	<section class="border-b border-rule journal-grid">
		<div
			class="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28"
		>
			<div>
				<Badge tone="live">
					<span aria-hidden="true" class="size-1 bg-current"></span>
					Read-only incident intelligence
				</Badge>
				<h1
					class="mt-6 max-w-3xl font-display text-5xl leading-[0.98] font-semibold tracking-[-0.03em] text-pretty text-ink sm:text-6xl xl:text-[80px]"
				>
					A diagnosis your on-call can verify.
				</h1>
				<p class="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
					Inspect exact source snapshots in isolated sandboxes. Return the root cause, the evidence,
					and the limits—without touching production.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button href={startHref} size="lg">
						Get Started <ArrowRight aria-hidden="true" class="size-4" />
					</Button>
					<Button href={dashboardHref} size="lg" variant="ghost">Open Dashboard</Button>
				</div>
			</div>
			<article
				class="w-full rounded-[4px] border border-rule bg-surface shadow-[0_16px_40px_-16px_rgba(23,26,32,0.2),0_2px_6px_rgba(23,26,32,0.05)]"
			>
				<header class="flex items-center justify-between border-b border-rule px-4 py-3">
					<span class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
						Investigation record / 0427
					</span>
					<Badge tone="success">
						<span aria-hidden="true" class="size-1 bg-current"></span>
						Verified
					</Badge>
				</header>
				<div class="p-5 sm:p-7">
					<p class="font-mono text-[10px] tracking-[0.08em] text-high uppercase">
						High · Payment API
					</p>
					<h2 class="mt-3 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]">
						Concurrent cache eviction interrupts active archive reads
					</h2>
					<p class="mt-4 border-l-2 border-accent pl-4 text-sm leading-6 text-ink-muted">
						The clear path removes the content-addressed store without coordinating with active
						readers.
					</p>
					<div class="mt-6 overflow-hidden rounded-[3px] border border-rule">
						<p class="border-b border-rule bg-surface px-3 py-2 font-mono text-[10px] text-accent">
							E-01 · internal/cache/layers.go:94–107
						</p>
						<pre
							translate="no"
							class="bg-surface-raised px-3 py-2.5 font-mono text-[11px] leading-5 text-ink-muted">if err := os.RemoveAll(dir); err != nil &#123;</pre>
					</div>
					<dl
						class="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-rule bg-rule"
					>
						<div class="bg-surface px-3 py-2.5">
							<dt class="font-mono text-[9px] tracking-[0.08em] text-ink-faint uppercase">
								Revision
							</dt>
							<dd class="mt-1 truncate font-mono text-xs text-ink" translate="no">0fab160216e8</dd>
						</div>
						<div class="bg-surface px-3 py-2.5">
							<dt class="font-mono text-[9px] tracking-[0.08em] text-ink-faint uppercase">
								Sandbox
							</dt>
							<dd class="mt-1 font-mono text-xs text-success">Destroyed</dd>
						</div>
					</dl>
				</div>
			</article>
		</div>
	</section>
	<section class="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 sm:py-20">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<h2 class="font-display text-2xl font-semibold tracking-[-0.01em]">The operating model</h2>
			<span class="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
				Four-step pipeline
			</span>
		</div>
		<ol
			class="mt-6 grid gap-px overflow-hidden rounded-[4px] border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4"
		>
			{#each capabilities as [n, title, copy] (n)}
				<li class="bg-surface p-5">
					<span class="font-mono text-[10px] text-accent">{n}</span>
					<h3 class="mt-3 font-display text-lg font-semibold tracking-[-0.01em]">{title}</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">{copy}</p>
				</li>
			{/each}
		</ol>
	</section>
	<section class="border-y border-rule bg-surface">
		<div class="mx-auto grid max-w-[1240px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
			<div>
				<h2 class="font-display text-3xl font-semibold tracking-[-0.02em]">
					Evidence in. Nothing out.
				</h2>
				<p class="mt-4 max-w-lg text-sm leading-6 text-ink-muted">
					Repository commands run with no DNS, HTTP, HTTPS, private-network, or metadata access.
					Sandboxes are temporary; installation credentials remain worker-only.
				</p>
			</div>
			<ul class="divide-y divide-rule self-start rounded-[4px] border border-rule">
				{#each security as [Icon, label] (label)}
					<li class="flex items-center gap-3 px-4 py-4 text-sm">
						<Icon aria-hidden="true" class="size-4 text-accent" />
						{label}
					</li>
				{/each}
			</ul>
		</div>
	</section>
	<footer
		class="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-5 px-5 py-12 sm:px-8"
	>
		<p class="font-display text-2xl font-semibold tracking-[-0.01em]">
			Build a record, not a guess.
		</p>
		<Button href={startHref}>
			Get Started <ArrowRight aria-hidden="true" class="size-4" />
		</Button>
	</footer>
</main>
