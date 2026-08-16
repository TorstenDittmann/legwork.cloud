<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');
	const startHref = $derived(data.authState === 'onboarded' ? '/dashboard' : '/onboarding');
	const startLabel = $derived(data.authState === 'onboarded' ? 'Open dashboard' : 'Get started');

	type StepKind = 'step' | 'ruled-out' | 'confirmed';
	type Step = {
		at: string;
		body: string;
		kind: StepKind;
		tag?: string;
		cite?: string;
	};

	// A representative investigation. Elapsed time, not step numbers: the
	// duration is the thing worth reading.
	const trail: Step[] = [
		{
			at: '00:00',
			kind: 'step',
			body: 'Resolved payments-api to the deploy that preceded the first alert.',
			cite: '0fab160216e8'
		},
		{
			at: '00:11',
			kind: 'step',
			body: 'Sandbox created. No DNS, no HTTP, no private network, no metadata endpoint.'
		},
		{
			at: '00:26',
			kind: 'step',
			body: 'Read 14 files across internal/cache and internal/archive.'
		},
		{
			at: '01:38',
			kind: 'ruled-out',
			tag: 'Ruled out',
			body: 'Hypothesis: the archive reader leaks file handles under load. Handle count is flat across the incident window.',
			cite: 'internal/archive/reader.go:210–244'
		},
		{
			at: '02:52',
			kind: 'step',
			body: 'Hypothesis: cache eviction removes the store while readers still hold open paths.'
		},
		{
			at: '03:47',
			kind: 'confirmed',
			tag: 'Confirmed',
			body: 'The evict path calls os.RemoveAll without coordinating with active readers.',
			cite: 'internal/cache/layers.go:94–107'
		},
		{
			at: '04:12',
			kind: 'step',
			body: 'Sandbox destroyed. Working copy gone.'
		}
	];

	const guardrails = [
		'Read-only GitHub App',
		'No network egress',
		'Sandbox destroyed after every run',
		'Content purged at 30 days'
	];

	const setup = [
		{
			title: 'Approve the repositories',
			body: 'Install the read-only GitHub App and pick what Legwork may read. It never gets write access, and it never mints a token outside the worker.'
		},
		{
			title: 'Post the incident',
			body: 'Send it when your alerting fires. One endpoint, idempotent, per-service.'
		},
		{
			title: 'Take the callback',
			body: 'A signed callback arrives when the case closes — root cause, evidence, and the limits of what was checked.'
		}
	];

	const snippet = `curl -X POST https://legwork.dev/api/v1/services/payments-api/incidents \\
  -H "Authorization: Bearer $LEGWORK_API_KEY" \\
  -d '{"title":"5xx spike on /checkout","severity":"high"}'`;
</script>

<main class="min-h-screen">
	<nav aria-label="Main">
		<div class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
			<a href="/" aria-label="Legwork home"><Wordmark /></a>
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
					Automated code investigation
				</Badge>
				<h1
					class="mt-6 max-w-3xl font-display text-5xl leading-[1.02] font-semibold tracking-[-0.02em] text-pretty text-ink sm:text-6xl xl:text-[76px]"
				>
					Someone has to read the code at <em class="text-accent">3am</em>.
				</h1>
				<p class="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">
					Legwork opens your repository at the exact commit that broke, reads until it finds the
					cause, and hands you the evidence — every claim cited to a line, every dead end still on
					the record.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button href={startHref} size="lg">
						{startLabel}
						<ArrowRight aria-hidden="true" class="size-4" />
					</Button>
					<Button href="#trail" size="lg" variant="ghost">See what it found</Button>
				</div>
			</div>

			<article class="w-full rounded-2xl border border-rule bg-surface shadow-hero">
				<header class="flex items-center justify-between border-b border-rule px-5 py-3.5">
					<span class="font-mono text-xs text-ink-faint" translate="no">CASE 0427</span>
					<Badge tone="success">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-current"></span>
						Closed
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
					<dl class="mt-6 grid grid-cols-3 gap-3 border-t border-rule pt-5">
						<div>
							<dt class="text-xs text-ink-faint">Time to answer</dt>
							<dd class="mt-1 font-mono text-sm text-ink" translate="no">4m 12s</dd>
						</div>
						<div>
							<dt class="text-xs text-ink-faint">Files read</dt>
							<dd class="mt-1 font-mono text-sm text-ink" translate="no">14</dd>
						</div>
						<div>
							<dt class="text-xs text-ink-faint">Hypotheses</dt>
							<dd class="mt-1 font-mono text-sm text-ink" translate="no">2</dd>
						</div>
					</dl>
				</div>
			</article>
		</div>
	</section>

	<section id="trail" class="scroll-mt-8 border-y border-rule bg-surface">
		<div class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
			<div class="max-w-2xl">
				<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
					The part nobody wants to do at 3am
				</h2>
				<p class="mt-3 text-base leading-7 text-ink-muted">
					Every investigation is recorded as it happens, including the paths that went nowhere. This
					is the whole of case 0427.
				</p>
			</div>

			<ol class="trail mt-10 max-w-3xl">
				{#each trail as step, i (step.at)}
					<li
						class="grid grid-cols-[3rem_1.25rem_1fr] gap-x-3 sm:grid-cols-[4.5rem_1.25rem_1fr] sm:gap-x-4"
					>
						<span class="pt-px text-right font-mono text-xs text-ink-faint" translate="no">
							{step.at}
						</span>
						<span aria-hidden="true" class="relative flex justify-center">
							{#if i < trail.length - 1}
								<span class="absolute inset-y-0 top-2 w-px bg-rule"></span>
							{/if}
							<span
								class="relative mt-1 size-2.5 rounded-full border-2 {step.kind === 'confirmed'
									? 'border-accent bg-accent'
									: step.kind === 'ruled-out'
										? 'border-rule-strong bg-surface'
										: 'border-rule-strong bg-rule-strong'}"
							></span>
						</span>
						<div class="pb-8 last:pb-0">
							{#if step.tag}
								<Badge tone={step.kind === 'confirmed' ? 'accent' : 'neutral'} class="mb-2">
									{step.tag}
								</Badge>
							{/if}
							<p
								class="text-sm leading-6 {step.kind === 'ruled-out'
									? 'text-ink-faint'
									: 'text-ink-muted'}"
							>
								{step.body}
							</p>
							{#if step.cite}
								<p
									class="mt-1.5 font-mono text-[11px] {step.kind === 'confirmed'
										? 'text-accent'
										: 'text-ink-faint'}"
									translate="no"
								>
									{step.cite}
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<section class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
		<div class="grid items-start gap-12 lg:grid-cols-2">
			<article class="overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
				<header class="border-b border-rule px-6 py-3.5">
					<span class="font-mono text-xs text-ink-faint" translate="no">CASE 0427 · FINDING</span>
				</header>
				<div class="p-6 sm:p-8">
					<h3 class="font-display text-xl leading-snug font-semibold text-ink">
						Concurrent cache eviction interrupts active archive reads
					</h3>
					<div class="mt-5 overflow-hidden rounded-lg border border-rule">
						<p
							class="border-b border-rule bg-surface px-3.5 py-2 font-mono text-[11px] text-accent"
						>
							E-01 · internal/cache/layers.go:94–107
						</p>
						<pre
							translate="no"
							class="overflow-x-auto bg-surface-raised px-3.5 py-3 font-mono text-[11px] leading-5 text-ink-muted">if err := os.RemoveAll(dir); err != nil &#123;</pre>
					</div>
					<div class="mt-5 rounded-lg border border-dashed border-rule-strong px-4 py-3.5">
						<p class="font-mono text-[11px] tracking-wide text-ink-faint uppercase">Not verified</p>
						<p class="mt-1.5 text-sm leading-6 text-ink-muted">
							Production eviction rate was out of scope. The frequency of this collision is inferred
							from the code path, not measured.
						</p>
					</div>
				</div>
			</article>

			<div class="lg:pt-6">
				<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
					The answer arrives as a record
				</h2>
				<p class="mt-4 max-w-lg text-base leading-7 text-ink-muted">
					A diagnosis you cannot check is a guess with better grammar. Every claim Legwork makes
					points at source it actually read, at a commit that cannot move underneath you.
				</p>
				<p class="mt-4 max-w-lg text-base leading-7 text-ink-muted">
					And when it could not check something, it says so in the finding rather than rounding up
					to confidence. The limits are part of the answer.
				</p>
			</div>
		</div>
	</section>

	<section class="border-y border-rule bg-surface">
		<div class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
			<div class="max-w-2xl">
				<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
					Three things to wire up
				</h2>
			</div>
			<div class="mt-10 grid gap-10 lg:grid-cols-[.9fr_1.1fr]">
				<ol class="space-y-6">
					{#each setup as item, i (item.title)}
						<li class="grid grid-cols-[1.5rem_1fr] gap-x-3">
							<span class="pt-0.5 font-mono text-xs text-ink-faint" translate="no">
								{i + 1}
							</span>
							<div>
								<h3 class="text-base font-semibold text-ink">{item.title}</h3>
								<p class="mt-1.5 text-sm leading-6 text-ink-muted">{item.body}</p>
							</div>
						</li>
					{/each}
				</ol>
				<div class="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
					<p class="border-b border-rule px-4 py-2.5 font-mono text-[11px] text-ink-faint">
						POST an incident
					</p>
					<pre
						translate="no"
						class="overflow-x-auto bg-surface-raised px-4 py-4 font-mono text-[11px] leading-5 text-ink-muted">{snippet}</pre>
				</div>
			</div>
		</div>
	</section>

	<section class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
		<div class="flex flex-wrap items-baseline gap-x-8 gap-y-4">
			<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
				Evidence in. Nothing out.
			</h2>
			<ul class="flex flex-wrap gap-x-6 gap-y-2">
				{#each guardrails as item (item)}
					<li class="flex items-center gap-2 text-sm text-ink-muted">
						<span aria-hidden="true" class="size-1.5 rounded-full bg-accent"></span>
						{item}
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<footer class="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8 sm:pb-20">
		<div
			class="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-accent px-8 py-10 sm:px-12 sm:py-14"
		>
			<p
				class="max-w-xl font-display text-3xl font-semibold tracking-[-0.01em] text-pretty text-white sm:text-4xl"
			>
				Let it do the legwork.
			</p>
			<Button
				href={startHref}
				size="lg"
				class="border-transparent bg-white text-accent shadow-none hover:bg-accent-soft"
			>
				{startLabel}
				<ArrowRight aria-hidden="true" class="size-4" />
			</Button>
		</div>
	</footer>
</main>

<style>
	/* An investigation unfolds in time; the trail reveals the same way.
	   Scroll-driven, so it costs no JS and degrades to plain visible steps. */
	@media (prefers-reduced-motion: no-preference) {
		@supports (animation-timeline: view()) {
			.trail li {
				animation: step-in linear both;
				animation-timeline: view();
				animation-range: entry 10% entry 55%;
			}

			@keyframes step-in {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
				to {
					opacity: 1;
					transform: none;
				}
			}
		}
	}
</style>
