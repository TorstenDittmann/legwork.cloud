<!-- DRAFT: review by counsel before publishing. -->
<script lang="ts">
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');
</script>

<svelte:head>
	<meta name="description" content="The terms that govern your use of Legwork." />
</svelte:head>

<div class="min-h-screen">
	<header class="border-b border-rule bg-canvas/90 backdrop-blur">
		<nav
			aria-label="Main"
			class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8"
		>
			<a href="/" aria-label="Legwork home"><Wordmark /></a>
			<div class="flex items-center gap-2 sm:gap-5">
				<a href="/docs" class="hidden text-sm font-medium text-ink-muted hover:text-ink sm:block">
					Docs
				</a>
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
		</nav>
	</header>

	<main class="mx-auto max-w-[1200px] px-5 pt-14 pb-20 sm:px-8 sm:pt-20 sm:pb-24">
		<div class="max-w-3xl">
			<p class="font-mono text-xs tracking-[0.14em] text-accent uppercase">Legal</p>
			<h1
				class="mt-5 font-display text-4xl leading-[1.06] font-semibold tracking-[-0.02em] text-ink sm:text-5xl"
			>
				Terms of Service
			</h1>
			<p class="mt-4 text-sm text-ink-faint">Effective date: August 20, 2026</p>
			<p class="mt-5 text-base leading-7 text-ink-muted">
				These terms govern your use of Legwork, the automated incident investigation service. By
				creating an account or using the service you agree to them on behalf of yourself and, if you
				act for one, your organization.
			</p>

			<div class="mt-10 space-y-10">
				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						1. The service
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Legwork investigates software incidents by reading the code of GitHub repositories you
						connect, at the specific commit involved, together with the incident data you send. It
						produces a diagnosis with cited evidence. Access to your repositories is read-only, and
						the working copy used for an analysis is destroyed when the analysis ends. The service
						does not modify your code, your infrastructure, or your production systems.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						2. Accounts and organizations
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						You sign in through our authentication provider and act within an organization.
						Organization admins control repository connections, services, members, and billing. You
						are responsible for the accuracy of your account information, for the actions taken
						under your account, and for keeping credentials confidential — in particular service API
						keys and callback signing secrets, which are displayed once at creation. If you believe
						a key has been exposed, rotate it in the dashboard immediately.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						3. Acceptable use
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">You agree not to:</p>
					<ul class="mt-3 space-y-2.5">
						<li class="flex gap-3 text-sm leading-6 text-ink-muted">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							connect repositories or submit incident data you do not have the right to share with us;
						</li>
						<li class="flex gap-3 text-sm leading-6 text-ink-muted">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							use the service for unlawful purposes or to analyze code for the purpose of exploiting systems
							you are not authorized to test;
						</li>
						<li class="flex gap-3 text-sm leading-6 text-ink-muted">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							probe, interfere with, or attempt to escape the analysis sandbox or any other isolation
							boundary of the service;
						</li>
						<li class="flex gap-3 text-sm leading-6 text-ink-muted">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							circumvent rate limits or plan quotas, or share one subscription across organizations;
						</li>
						<li class="flex gap-3 text-sm leading-6 text-ink-muted">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							resell or offer the service to third parties without our written agreement.
						</li>
					</ul>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						4. Plans, payment, and cancellation
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						The Developer plan is free within its quotas. Paid plans are billed monthly or annually
						through Dodo Payments, which acts as the merchant of record: your payment relationship,
						including tax calculation, invoices, and payment methods, is with Dodo Payments.
						Subscriptions renew automatically until cancelled. You can cancel at any time from the
						billing portal; cancellation takes effect at the end of the current billing period, and
						you keep access until then. Each plan carries monthly investigation and model-token
						quotas; when a quota is exhausted, new investigations are declined until the next
						billing month while existing findings remain available. We may change prices with
						advance notice, effective from your next billing period.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						5. Your content
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						You retain all rights to your repositories, incident data, and the diagnoses produced
						from them. You grant us the limited rights needed to operate the service: to fetch and
						transiently process repository contents during an analysis, to store the incident data
						you send and the resulting diagnoses for the retention period described in our
						<a href="/privacy" class="font-medium text-accent hover:underline">Privacy Policy</a>,
						and to deliver results to the destinations you configure. We do not use your code or
						incident data to train models.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						6. Automated analysis, no guarantee
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Diagnoses are produced by automated analysis, including large language models. Every
						claim is cited to the code it came from, and citations are validated against the
						analyzed snapshot, but a diagnosis can still be wrong, incomplete, or miss the actual
						cause. Diagnoses are an aid to your engineers, not a substitute for their judgment. You
						are responsible for verifying findings before acting on them, especially before changing
						production systems.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						7. Our intellectual property
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						The service, including its software, design, and documentation, remains ours. If you
						send us feedback, we may use it without obligation to you.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						8. Termination
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						You may stop using the service and disconnect your repositories at any time. We may
						suspend or terminate access for material breach of these terms, for security reasons, or
						if required by law; where reasonable, we will notify you first. After termination,
						stored analysis data is deleted under the retention schedule in the Privacy Policy, and
						you can request earlier deletion.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						9. Disclaimers and limitation of liability
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						The service is provided “as is” and “as available”, without warranties of any kind,
						express or implied, including fitness for a particular purpose and non-infringement. To
						the maximum extent permitted by law, neither party is liable for indirect, incidental,
						special, or consequential damages, or for lost profits, revenue, or data. Our total
						liability arising out of the service is limited to the amounts you paid us in the twelve
						months before the event giving rise to the claim. Nothing in these terms excludes
						liability that cannot be excluded by law.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						10. Governing law
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						<span class="font-medium text-ink">[Governing law and venue — to be completed.]</span>
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						11. Changes to these terms
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						We may update these terms as the service evolves. For material changes we will give
						notice — by email or in the dashboard — before they take effect. Continuing to use the
						service after the effective date means you accept the updated terms.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						12. Contact
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Questions about these terms:
						<a href="mailto:hello@legwork.cloud" class="font-medium text-accent hover:underline"
							>hello@legwork.cloud</a
						>.
					</p>
				</section>
			</div>
		</div>
	</main>

	<SiteFooter />
</div>
