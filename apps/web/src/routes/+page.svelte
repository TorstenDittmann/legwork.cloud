<script lang="ts">
	import type { Component } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import {
		ArrowRight,
		Mail,
		MessageSquareText,
		ScanSearch,
		TriangleAlert,
		Webhook
	} from '@lucide/svelte';
	import Wordmark from '$lib/components/wordmark.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import BrandLogo, { type Brand } from '$lib/components/brand-logo.svelte';
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
		/** Pays off the jargon in `body` — what the reader gets from it. */
		detail?: string;
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
			at: '00:02',
			kind: 'step',
			body: 'Sandbox created.'
		},
		{
			at: '00:04',
			kind: 'step',
			body: 'Queried Grafana across the incident window. Error rate steps at 14:02; p99 latency unchanged.'
		},
		{
			at: '00:07',
			kind: 'step',
			body: 'Read 14 files across internal/cache and internal/archive.'
		},
		{
			at: '00:11',
			kind: 'ruled-out',
			tag: 'Ruled out',
			body: 'Hypothesis: the archive reader leaks file handles under load.',
			detail: 'Handle count is flat across the incident window.',
			cite: 'internal/archive/reader.go:210–244'
		},
		{
			at: '00:16',
			kind: 'step',
			body: 'Hypothesis: cache eviction removes the store while readers still hold open paths.'
		},
		{
			at: '00:20',
			kind: 'confirmed',
			tag: 'Confirmed',
			body: 'The evict path calls os.RemoveAll without coordinating with active readers.',
			cite: 'internal/cache/layers.go:94–107'
		},
		{
			at: '00:23',
			kind: 'step',
			body: 'Sandbox destroyed. Working copy gone.'
		}
	];

	type Tag = { label: string; brand?: Brand; Icon?: Component };
	type FlowStep = { kicker: string; title: string; body: string; Icon: Component; tags?: Tag[] };

	// The lifecycle end to end. Grafana and Sentry appear twice on purpose: the
	// same connection that opens a case is the one queried for evidence during it.
	const flow: FlowStep[] = [
		{
			kicker: 'Connect',
			title: 'Point your alerting at Legwork',
			body: 'Grafana and Sentry post their alerts straight in. Anything else opens a case over the API.',
			Icon: Webhook,
			tags: [
				{ label: 'Grafana', brand: 'grafana' },
				{ label: 'Sentry', brand: 'sentry' },
				{ label: 'HTTP', Icon: Webhook }
			]
		},
		{
			kicker: 'Incident',
			title: 'A case opens',
			body: 'Idempotent on your incident key, so a retrying alert cannot open the same case twice.',
			Icon: TriangleAlert
		},
		{
			kicker: 'Investigate',
			title: 'It reads the code and the telemetry',
			body: 'Your repository at the exact commit that broke, through a read-only GitHub App. Then logs, metrics, traces, and linked issues from the connections above.',
			Icon: ScanSearch
		},
		{
			kicker: 'Answer',
			title: 'The finding lands where you already are',
			body: 'Root cause, cited evidence, and whatever it could not check — delivered to your channel or signed and posted back to your own endpoint.',
			Icon: MessageSquareText,
			tags: [
				{ label: 'Slack', brand: 'slack' },
				{ label: 'Discord', brand: 'discord' },
				{ label: 'Email', Icon: Mail },
				{ label: 'Webhook', Icon: Webhook }
			]
		}
	];

	const snippet = `curl -X POST https://legwork.dev/api/v1/services/payments-api/incidents \\
  -H "Authorization: Bearer $LEGWORK_API_KEY" \\
  -d '{"title":"5xx spike on /checkout","severity":"high"}'`;

	// The trail replays case 0427 in compressed time. Real elapsed time is shown
	// on the clock; only the wall-clock playback is sped up.
	const TOTAL_SECONDS = 23;
	const REPLAY_MS = 8_000;

	function toSeconds(at: string) {
		const [minutes, seconds] = at.split(':').map(Number);
		return minutes * 60 + seconds;
	}

	function formatClock(elapsed: number) {
		const whole = Math.floor(elapsed);
		const minutes = String(Math.floor(whole / 60)).padStart(2, '0');
		const seconds = String(whole % 60).padStart(2, '0');
		return `${minutes}:${seconds}`;
	}

	let clock = $state(0);
	let finished = $state(false);
	let playing = $state(false);
	let started = $state(false);
	// False until the client takes over, so no-JS and reduced-motion readers get
	// the whole trail rather than seven blank rows.
	let armed = $state(false);
	let frame = 0;

	function play(reset = false) {
		cancelAnimationFrame(frame);
		if (reset) clock = 0;
		finished = false;
		playing = true;
		started = true;
		const initialClock = clock;
		const start = performance.now();
		const tick = (now: number) => {
			clock = Math.min(initialClock + ((now - start) / REPLAY_MS) * TOTAL_SECONDS, TOTAL_SECONDS);
			if (clock < TOTAL_SECONDS) frame = requestAnimationFrame(tick);
			else {
				finished = true;
				playing = false;
			}
		};
		frame = requestAnimationFrame(tick);
	}

	function pause() {
		cancelAnimationFrame(frame);
		playing = false;
	}

	const replayTrail: Attachment<HTMLOListElement> = (list) => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			clock = TOTAL_SECONDS;
			finished = true;
			started = true;
			return;
		}

		armed = true;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					play();
				}
			},
			{ threshold: 0.2 }
		);
		observer.observe(list);

		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	};
</script>

<div class="min-h-screen">
	<header>
		<nav aria-label="Main">
			<div class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8">
				<a href="/" aria-label="Legwork home"><Wordmark /></a>
				<div class="flex items-center gap-2 sm:gap-5">
					<a
						href="/pricing"
						class="hidden text-sm font-medium text-ink-muted hover:text-ink sm:block"
					>
						Pricing
					</a>
					<Button href={dashboardHref} variant="outline" size="sm">
						{signedIn ? 'Open dashboard' : 'Sign in'}
					</Button>
				</div>
			</div>
		</nav>
	</header>

	<main>
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
						Legwork checks out the exact commit that broke and reads the code until it finds the
						cause. Every claim comes back cited to a line, including the hypotheses it ruled out.
					</p>
					<div class="mt-8 flex flex-wrap gap-3">
						<Button href={startHref} size="lg">
							{startLabel}
							<ArrowRight aria-hidden="true" class="size-4" />
						</Button>
						<Button href="#trail" size="lg" variant="ghost">Watch a 23-second investigation</Button>
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
						<!-- A sample artifact, not a section of this page: styled as a title
						     but deliberately not a heading, so the document outline stays clean. -->
						<p
							class="mt-3 font-display text-2xl leading-snug font-semibold tracking-[-0.01em] text-ink"
						>
							Concurrent cache eviction interrupts active archive reads
						</p>
						<p class="mt-4 border-l-2 border-accent pl-4 text-sm leading-6 text-ink-muted">
							The clear path removes the content-addressed store without coordinating with active
							readers.
						</p>
						<dl class="mt-6 grid grid-cols-3 gap-3 border-t border-rule pt-5">
							<div>
								<dt class="text-xs text-ink-faint">Time to answer</dt>
								<dd class="mt-1 font-mono text-sm text-ink" translate="no">23s</dd>
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
						Case 0427, as it happened
					</h2>
					<p class="mt-3 text-base leading-7 text-ink-muted">
						Twenty-three seconds, replayed at speed. Every step, including the one that went
						nowhere.
					</p>
					<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
						<span
							class="font-mono text-2xl font-medium text-ink tabular-nums"
							aria-hidden="true"
							translate="no"
						>
							{formatClock(armed ? clock : TOTAL_SECONDS)}
						</span>
						<span class="text-xs text-ink-faint">elapsed in the investigation</span>
						{#if armed}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() => (finished ? play(true) : playing ? pause() : play())}
							>
								{finished ? 'Replay' : playing ? 'Pause' : started ? 'Resume' : 'Play'}
							</Button>
						{/if}
					</div>
				</div>

				<ol {@attach replayTrail} class="mt-10 max-w-3xl">
					{#each trail as step, i (step.at)}
						{@const shown = !armed || toSeconds(step.at) <= clock}
						<li
							class="trail-step grid grid-cols-[3rem_1.25rem_1fr] gap-x-3 sm:grid-cols-[4.5rem_1.25rem_1fr] sm:gap-x-4"
							class:is-shown={shown}
						>
							<span class="pt-px text-right font-mono text-xs text-ink-faint" translate="no">
								{step.at}
							</span>
							<span aria-hidden="true" class="relative flex justify-center">
								{#if i < trail.length - 1}
									<span class="absolute top-3 bottom-0 w-px bg-rule"></span>
								{/if}
								<span
									class="relative mt-1 size-2.5 rounded-full border-2 {step.kind === 'confirmed'
										? 'border-accent bg-accent'
										: step.kind === 'ruled-out'
											? 'border-rule-strong bg-surface'
											: 'border-rule-strong bg-rule-strong'}"
								></span>
							</span>
							<div class="pb-8">
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
								{#if step.detail}
									<p class="mt-1.5 text-sm leading-6 text-ink-faint">{step.detail}</p>
								{/if}
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

		<section>
			<div class="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
				<div class="max-w-2xl">
					<h2 class="font-display text-3xl font-semibold tracking-[-0.01em] text-ink sm:text-4xl">
						From alert to answer
					</h2>
					<p class="mt-3 text-base leading-7 text-ink-muted">
						Legwork sits between the alert that wakes you and the channel you would have posted in
						anyway.
					</p>
				</div>

				<!-- The rule above each step joins into one continuous line across the
				     row: the trail's timeline, turned on its side. -->
				<ol class="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
					{#each flow as step, i (step.kicker)}
						{@const last = i === flow.length - 1}
						<li class="relative border-t border-rule pt-8">
							<!-- The badge sits on the rule and shares the section background,
							     so the line reads as passing behind it. -->
							<span
								aria-hidden="true"
								class="absolute -top-[15px] left-0 flex size-[30px] items-center justify-center rounded-lg border bg-canvas {last
									? 'border-accent text-accent'
									: 'border-rule text-ink-faint'}"
							>
								<step.Icon class="size-4" />
							</span>
							<p
								class="font-mono text-[11px] tracking-wide text-ink-faint uppercase"
								translate="no"
							>
								{step.kicker}
							</p>
							<h3 class="mt-2 text-base leading-snug font-semibold text-ink">{step.title}</h3>
							<p class="mt-2 text-sm leading-6 text-ink-muted">{step.body}</p>
							{#if step.tags}
								<ul class="mt-4 flex flex-wrap gap-1.5">
									{#each step.tags as tag (tag.label)}
										<li
											class="flex items-center gap-1.5 rounded-md border border-rule bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted"
											translate="no"
										>
											{#if tag.brand}
												<BrandLogo name={tag.brand} class="size-3 shrink-0" />
											{:else if tag.Icon}
												<tag.Icon class="size-3 shrink-0" />
											{/if}
											{tag.label}
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ol>

				<!-- The two ends of the flow, side by side: what you send, what arrives.
				     The finding shown is case 0427, the same one the trail replays. -->
				<div class="mt-14 grid items-start gap-6 lg:grid-cols-2">
					<div class="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
						<p class="border-b border-rule px-4 py-2.5 font-mono text-[11px] text-ink-faint">
							POST an incident
						</p>
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<pre
							translate="no"
							tabindex="0"
							role="region"
							aria-label="Example request that opens an incident"
							class="overflow-x-auto bg-surface-raised px-4 py-4 font-mono text-[11px] leading-5 text-ink-muted">{snippet}</pre>
					</div>

					<figure class="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
						<figcaption
							class="flex items-center gap-2 border-b border-rule px-4 py-2.5 font-mono text-[11px] text-ink-faint"
						>
							<BrandLogo name="slack" class="size-3.5" />
							<span translate="no">#incidents</span>
						</figcaption>
						<div class="flex items-start gap-3 px-4 py-4">
							<span
								aria-hidden="true"
								class="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent font-display text-sm font-semibold text-white"
							>
								L
							</span>
							<div class="min-w-0">
								<p class="flex flex-wrap items-baseline gap-x-2">
									<span class="text-sm font-semibold text-ink">Legwork</span>
									<span
										class="rounded bg-surface-raised px-1 py-px font-mono text-[10px] tracking-wide text-ink-faint uppercase"
									>
										App
									</span>
									<span class="font-mono text-[11px] text-ink-faint" translate="no">2:14</span>
								</p>
								<p class="mt-1.5 flex items-center gap-2 text-xs font-medium text-high">
									<span aria-hidden="true" class="size-1.5 rounded-full bg-high"></span>
									High · payments-api · closed in 23s
								</p>
								<p class="mt-1.5 text-sm leading-6 font-medium text-ink">
									Concurrent cache eviction interrupts active archive reads
								</p>
								<p class="mt-1 font-mono text-[11px] text-accent" translate="no">
									internal/cache/layers.go:94–107
								</p>
								<!-- The limits ship with the finding rather than in prose elsewhere:
								     showing it in the artifact is the whole point. -->
								<p
									class="mt-2.5 border-l-2 border-rule-strong pl-2.5 text-[11px] leading-5 text-ink-faint"
								>
									Not verified: production eviction rate was out of scope.
								</p>
							</div>
						</div>
					</figure>
				</div>
			</div>
		</section>
	</main>

	<footer class="mx-auto max-w-[1200px] px-5 pt-16 pb-16 sm:pt-20 sm:pb-20">
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

	<SiteFooter />
</div>

<style>
	/* Spacing belongs to the row, not its last child: a `last:` utility on the
	   body div matched every step, because that div is always the li's last
	   child. Scoping to the li gets the rhythm the layout intended. */
	.trail-step:last-child > div {
		padding-bottom: 0;
	}

	/* An investigation unfolds in time; the trail replays the same way. Steps
	   fade in place rather than growing the list, so nothing below shifts. */
	.trail-step {
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 420ms ease,
			transform 420ms ease;
	}

	.trail-step.is-shown {
		opacity: 1;
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.trail-step {
			transition: none;
		}
	}
</style>
