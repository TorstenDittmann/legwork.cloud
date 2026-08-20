<script lang="ts">
	import { ArrowRight, Check, CreditCard, Globe2, LockKeyhole, ShieldCheck } from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import { formatQuota, formatTokenQuota, pricingPlans, type BillingInterval } from '$lib/pricing';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let interval = $state<BillingInterval>('year');

	const hasManagedSubscription = $derived(
		data.subscription !== null &&
			['pending', 'active', 'on_hold', 'paused'].includes(data.subscription.status)
	);
	const accountHref = $derived(data.authState === 'onboarded' ? '/dashboard' : '/sign-in');
	const developerHref = $derived(
		data.authState === 'onboarded'
			? '/dashboard'
			: data.authState === 'needs-onboarding'
				? '/onboarding?returnTo=/pricing'
				: '/sign-in?returnTo=/pricing'
	);
	const paidStartHref = $derived(
		data.authState === 'needs-onboarding'
			? '/onboarding?returnTo=/pricing'
			: '/sign-in?returnTo=/pricing'
	);

	const faqs = [
		{
			question: 'What counts as an investigation?',
			answer:
				'Each incident analysis run counts once. If you deliberately retry a completed or inconclusive run, the retry counts as a new investigation.'
		},
		{
			question: 'What happens when we reach a monthly limit?',
			answer:
				'Legwork stops accepting new investigation runs for the remainder of the billing month. Your services, connections, and existing findings stay available.'
		},
		{
			question: 'Do you charge per teammate?',
			answer:
				'No. Invite the people who share the on-call rotation. Pricing scales with investigations and model usage, which is closer to the value Legwork delivers.'
		},
		{
			question: 'Can I change or cancel a paid plan?',
			answer:
				'Yes. Organization admins can open the secure Dodo Payments customer portal to manage the subscription, invoices, and payment method.'
		},
		{
			question: 'How are taxes and local payment methods handled?',
			answer:
				'Dodo Payments is the merchant of record. Applicable tax is calculated at checkout, and available payment methods are shown for the buyer’s location.'
		}
	] as const;
</script>

<svelte:head>
	<meta
		name="description"
		content="Simple Legwork pricing based on incident investigations, not seats. Start free, then scale with your on-call workload."
	/>
</svelte:head>

<div class="min-h-screen">
	<header class="border-b border-rule bg-canvas/90 backdrop-blur">
		<nav
			aria-label="Main"
			class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8"
		>
			<a href="/" aria-label="Legwork home"><Wordmark /></a>
			<div class="flex items-center gap-2 sm:gap-5">
				<a href="/pricing" aria-current="page" class="hidden text-sm font-medium text-ink sm:block">
					Pricing
				</a>
				<Button href={accountHref} variant="outline" size="sm">
					{data.authState === 'onboarded' ? 'Open dashboard' : 'Sign in'}
				</Button>
			</div>
		</nav>
	</header>

	<main>
		<section class="mx-auto max-w-[1200px] px-5 pt-16 pb-14 text-center sm:px-8 sm:pt-24 sm:pb-20">
			<p class="font-mono text-xs tracking-[0.14em] text-accent uppercase">
				Simple, usage-led pricing
			</p>
			<h1
				class="mx-auto mt-5 max-w-4xl font-display text-5xl leading-[1.04] font-semibold tracking-[-0.025em] text-pretty text-ink sm:text-6xl lg:text-[72px]"
			>
				Pay for the incidents, <em class="text-accent">not the seats.</em>
			</h1>
			<p class="mx-auto mt-6 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">
				Every plan includes read-only code access, evidence-backed findings, and delivery to the
				tools your on-call team already uses.
			</p>

			<div
				class="mx-auto mt-9 inline-flex rounded-xl border border-rule-strong bg-surface p-1 shadow-card"
				aria-label="Billing interval"
			>
				<button
					type="button"
					aria-pressed={interval === 'month'}
					onclick={() => (interval = 'month')}
					class="min-h-10 rounded-lg px-4 text-sm font-medium transition-colors {interval ===
					'month'
						? 'bg-ink text-white'
						: 'text-ink-muted hover:text-ink'}"
				>
					Monthly
				</button>
				<button
					type="button"
					aria-pressed={interval === 'year'}
					onclick={() => (interval = 'year')}
					class="flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors {interval ===
					'year'
						? 'bg-ink text-white'
						: 'text-ink-muted hover:text-ink'}"
				>
					Annual
					<span
						class="rounded-full px-2 py-0.5 text-[10px] font-semibold {interval === 'year'
							? 'bg-white/15 text-white'
							: 'bg-accent-soft text-accent'}"
					>
						2 months free
					</span>
				</button>
			</div>
		</section>

		{#if data.checkoutCancelled}
			<div class="mx-auto mb-6 max-w-[1150px] px-5 sm:px-8">
				<p class="rounded-xl border border-rule-strong bg-surface px-4 py-3 text-sm text-ink-muted">
					Checkout was cancelled. Nothing was charged.
				</p>
			</div>
		{/if}
		{#if form?.message}
			<div class="mx-auto mb-6 max-w-[1150px] px-5 sm:px-8">
				<p
					role="alert"
					class="rounded-xl border border-danger/25 bg-red-50 px-4 py-3 text-sm text-danger"
				>
					{form.message}
				</p>
			</div>
		{/if}

		<section aria-label="Plans" class="mx-auto max-w-[1150px] px-5 pb-14 sm:px-8 sm:pb-20">
			<div class="grid items-stretch gap-5 lg:grid-cols-3">
				{#each pricingPlans as plan (plan.slug)}
					<article
						class="relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card sm:p-7 {plan.slug ===
						'team'
							? 'border-accent shadow-lift'
							: 'border-rule'}"
					>
						{#if plan.slug === 'team'}
							<p
								class="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold tracking-wide text-white uppercase"
							>
								Most popular
							</p>
						{/if}
						<div class="flex items-start justify-between gap-4">
							<div>
								<h2 class="font-display text-2xl font-semibold text-ink">{plan.name}</h2>
								<p class="mt-2 min-h-12 text-sm leading-6 text-ink-muted">{plan.description}</p>
							</div>
							{#if data.subscription?.plan === plan.slug}
								<span
									class="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold tracking-wide text-accent uppercase"
								>
									Current
								</span>
							{/if}
						</div>

						<div class="mt-7 border-t border-rule pt-6">
							<div class="flex items-end gap-1.5">
								<span class="font-display text-5xl font-semibold tracking-[-0.03em] text-ink">
									${interval === 'year' ? plan.annualPrice : plan.monthlyPrice}
								</span>
								<span class="pb-1.5 text-sm text-ink-faint">/ month</span>
							</div>
							<p class="mt-2 h-5 text-xs text-ink-faint">
								{#if plan.slug === 'developer'}
									No card required
								{:else if interval === 'year'}
									${plan.annualTotal.toLocaleString('en-US')} billed annually
								{:else}
									Billed monthly
								{/if}
							</p>
						</div>

						<ul class="mt-7 flex-1 space-y-3.5">
							{#each plan.features as feature (feature)}
								<li class="flex gap-3 text-sm leading-5 text-ink-muted">
									<span
										aria-hidden="true"
										class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
									>
										<Check class="size-3" strokeWidth={2.5} />
									</span>
									{feature}
								</li>
							{/each}
						</ul>

						<div class="mt-8">
							{#if plan.slug === 'developer'}
								<Button href={developerHref} variant="outline" size="lg" class="w-full">
									{data.authState === 'onboarded' ? 'Open dashboard' : 'Start free'}
								</Button>
							{:else if hasManagedSubscription}
								<Button
									href="/billing/portal"
									variant={plan.slug === 'team' ? 'default' : 'outline'}
									size="lg"
									class="w-full"
								>
									Manage billing
									<ArrowRight aria-hidden="true" class="size-4" />
								</Button>
							{:else if data.authState !== 'onboarded'}
								<Button
									href={paidStartHref}
									variant={plan.slug === 'team' ? 'default' : 'outline'}
									size="lg"
									class="w-full"
								>
									Start {plan.name}
									<ArrowRight aria-hidden="true" class="size-4" />
								</Button>
							{:else if data.role !== 'admin'}
								<Button disabled variant="outline" size="lg" class="w-full">Ask an admin</Button>
							{:else}
								<form method="POST" action="?/checkout">
									<input type="hidden" name="plan" value={plan.slug} />
									<input type="hidden" name="interval" value={interval} />
									<Button
										type="submit"
										variant={plan.slug === 'team' ? 'default' : 'outline'}
										size="lg"
										class="w-full"
									>
										Start {plan.name}
										<ArrowRight aria-hidden="true" class="size-4" />
									</Button>
								</form>
							{/if}
						</div>
					</article>
				{/each}
			</div>

			<div
				class="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-ink-faint"
			>
				<span class="flex items-center gap-2"
					><LockKeyhole class="size-3.5" /> Secure hosted checkout</span
				>
				<span class="flex items-center gap-2"
					><Globe2 class="size-3.5" /> Local currencies and taxes</span
				>
				<span class="flex items-center gap-2"
					><CreditCard class="size-3.5" /> Billing by Dodo Payments</span
				>
			</div>
		</section>

		<section class="border-y border-rule bg-surface">
			<div class="mx-auto max-w-[1150px] px-5 py-16 sm:px-8 sm:py-20">
				<div class="max-w-2xl">
					<p class="font-mono text-xs tracking-[0.12em] text-accent uppercase">Compare plans</p>
					<h2
						class="mt-3 font-display text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl"
					>
						The same investigator. More room to run.
					</h2>
					<p class="mt-3 text-base leading-7 text-ink-muted">
						Features stay consistent between plans. Capacity grows with the incident load.
					</p>
				</div>
				<div class="mt-10 overflow-x-auto rounded-2xl border border-rule">
					<table class="w-full min-w-[680px] border-collapse text-left text-sm">
						<thead class="bg-surface-raised">
							<tr>
								<th scope="col" class="px-5 py-4 font-medium text-ink-muted">Monthly capacity</th>
								{#each pricingPlans as plan (plan.slug)}
									<th scope="col" class="px-5 py-4 font-semibold text-ink">{plan.name}</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-rule bg-surface">
							<tr>
								<th scope="row" class="px-5 py-4 font-normal text-ink-muted">Investigations</th>
								{#each pricingPlans as plan (plan.slug)}
									<td class="px-5 py-4 font-mono text-xs text-ink">
										{formatQuota(plan.entitlements.monthlyAnalysisQuota)}
									</td>
								{/each}
							</tr>
							<tr>
								<th scope="row" class="px-5 py-4 font-normal text-ink-muted">Model tokens</th>
								{#each pricingPlans as plan (plan.slug)}
									<td class="px-5 py-4 font-mono text-xs text-ink">
										{formatTokenQuota(plan.entitlements.monthlyTokenQuota)}
									</td>
								{/each}
							</tr>
							<tr>
								<th scope="row" class="px-5 py-4 font-normal text-ink-muted">Concurrent runs</th>
								{#each pricingPlans as plan (plan.slug)}
									<td class="px-5 py-4 font-mono text-xs text-ink">
										{plan.entitlements.maxConcurrentRuns}
									</td>
								{/each}
							</tr>
							<tr>
								<th scope="row" class="px-5 py-4 font-normal text-ink-muted">Teammates</th>
								<td class="px-5 py-4 text-ink">Unlimited</td>
								<td class="px-5 py-4 text-ink">Unlimited</td>
								<td class="px-5 py-4 text-ink">Unlimited</td>
							</tr>
							<tr>
								<th scope="row" class="px-5 py-4 font-normal text-ink-muted">Support</th>
								<td class="px-5 py-4 text-ink">Community</td>
								<td class="px-5 py-4 text-ink">Email</td>
								<td class="px-5 py-4 text-ink">Priority</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</section>

		<section
			class="mx-auto grid max-w-[1150px] gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.8fr_1.2fr] lg:gap-20"
		>
			<div>
				<div
					class="grid size-11 place-items-center rounded-xl border border-rule bg-surface text-accent shadow-card"
				>
					<ShieldCheck aria-hidden="true" class="size-5" />
				</div>
				<h2
					class="mt-5 font-display text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl"
				>
					Questions before the pager goes off?
				</h2>
				<p class="mt-3 max-w-md text-base leading-7 text-ink-muted">
					The practical details about limits, billing, and what your team can expect.
				</p>
			</div>
			<div class="divide-y divide-rule border-y border-rule">
				{#each faqs as faq (faq.question)}
					<details class="group py-5">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-6 text-sm font-semibold text-ink marker:content-none"
						>
							{faq.question}
							<span
								aria-hidden="true"
								class="text-xl font-light text-ink-faint transition-transform group-open:rotate-45"
								>+</span
							>
						</summary>
						<p class="max-w-2xl pt-3 pr-10 text-sm leading-6 text-ink-muted">{faq.answer}</p>
					</details>
				{/each}
			</div>
		</section>

		<section class="mx-auto max-w-[1150px] px-5 pb-16 sm:px-8 sm:pb-24">
			<div
				class="flex flex-col gap-7 rounded-2xl bg-ink px-7 py-9 text-white sm:px-10 sm:py-11 lg:flex-row lg:items-center lg:justify-between"
			>
				<div>
					<p class="font-mono text-[11px] tracking-[0.14em] text-white/55 uppercase">Enterprise</p>
					<h2 class="mt-2 font-display text-3xl font-semibold">
						Need a different operating envelope?
					</h2>
					<p class="mt-2 max-w-2xl text-sm leading-6 text-white/65">
						Talk to us about higher investigation volume, procurement, custom retention, and rollout
						support.
					</p>
				</div>
				<Button
					href="mailto:hello@legwork.cloud?subject=Legwork%20Enterprise"
					size="lg"
					class="shrink-0 border-white/20 bg-white text-ink shadow-none hover:bg-white/90"
				>
					Talk to us
					<ArrowRight aria-hidden="true" class="size-4" />
				</Button>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>
