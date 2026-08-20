<!-- DRAFT: review by counsel before publishing. -->
<script lang="ts">
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');

	const subprocessors = [
		{ name: 'Railway', purpose: 'Application hosting and disposable analysis sandboxes' },
		{ name: 'WorkOS', purpose: 'Authentication and organization membership' },
		{ name: 'OpenRouter', purpose: 'Model inference for incident analysis' },
		{ name: 'GitHub', purpose: 'Read-only repository access for connected repositories' },
		{ name: 'Dodo Payments', purpose: 'Billing and payment processing for paid plans' },
		{ name: 'Resend', purpose: 'Email delivery for notification channels' }
	];
</script>

<svelte:head>
	<meta name="description" content="What Legwork processes, why, and for how long." />
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
				Privacy Policy
			</h1>
			<p class="mt-4 text-sm text-ink-faint">Effective date: August 20, 2026</p>
			<p class="mt-5 text-base leading-7 text-ink-muted">
				This policy explains what Legwork processes, why it needs it, and how long it keeps it.
				Legwork is an automated incident investigation service: it reads the code you connect and
				the incident data you send, and returns a diagnosis with citations.
			</p>

			<div class="mt-10 space-y-10">
				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						1. What we process
					</h2>
					<ul class="mt-3 space-y-3 text-sm leading-6 text-ink-muted">
						<li>
							<span class="font-medium text-ink">Account data.</span> Your email address and organization
							membership, handled through WorkOS. Legwork does not store passwords.
						</li>
						<li>
							<span class="font-medium text-ink">Repository contents.</span> When an analysis runs, the
							source of your connected repositories is downloaded at the exact commit involved into a
							disposable sandbox, read, and destroyed with that sandbox. Access is read-only.
						</li>
						<li>
							<span class="font-medium text-ink">Incident data.</span> The payloads you send to the ingest
							endpoint or through a connected alerting provider: titles, severities, timestamps, and any
							context you include.
						</li>
						<li>
							<span class="font-medium text-ink">Analysis output.</span> The diagnosis, its evidence citations,
							and the step-by-step record of the investigation.
						</li>
						<li>
							<span class="font-medium text-ink">Operational records.</span> Audit events for administrative
							actions, delivery records for notifications and callbacks, and usage counters for quota
							enforcement and billing.
						</li>
					</ul>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						2. Why we process it
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						To provide the service you asked for: to investigate the incidents you send, to deliver
						the results to the destinations you configure, to enforce the quotas on your plan, and
						to keep the service secure and available. Legwork does not sell your data, does not
						share it for advertising, and does not use your source code or incident data to train
						models.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						3. How long we keep it
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Incidents, analysis runs, diagnoses, investigation steps, and delivery records are
						retained for 30 days and then deleted automatically by a daily purge. Repository source
						is never retained past the run that read it: the sandbox holding it is destroyed when
						the analysis ends. Account, organization, and billing records are kept while your
						account is open.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						4. Secret redaction
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Incident payloads are scanned for credentials and redacted before analysis, and the
						summary and root cause are redacted again before they leave the system to a notification
						channel or callback. Redaction is pattern-based and cannot be guaranteed to catch every
						secret, so avoid sending credentials to the ingest endpoint.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						5. Subprocessors
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Legwork relies on the following providers to run the service:
					</p>
					<div class="mt-4 overflow-hidden rounded-xl border border-rule">
						<table class="w-full text-left text-sm">
							<thead class="bg-surface-muted">
								<tr>
									<th scope="col" class="px-4 py-3 font-medium text-ink">Provider</th>
									<th scope="col" class="px-4 py-3 font-medium text-ink">Purpose</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-rule">
								{#each subprocessors as subprocessor (subprocessor.name)}
									<tr>
										<td class="px-4 py-3 font-medium text-ink">{subprocessor.name}</td>
										<td class="px-4 py-3 text-ink-muted">{subprocessor.purpose}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						6. Security
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Stored credentials — provider tokens, webhook destinations, and callback secrets — are
						encrypted with AES-256-GCM bound to the record they belong to. Repository code is read
						in a sandbox with no network egress, and command execution is disabled unless an
						operator has verified an isolation probe. Outbound callbacks resolve to public addresses
						only, with the resolved address pinned for the request. The
						<a href="/security" class="text-accent underline underline-offset-4">security page</a>
						describes the model in full.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						7. Your choices
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						You control which repositories are connected and can disconnect them at any time, which
						ends Legwork's access. You can delete services, notification channels, and API keys from
						the dashboard. To request deletion of your organization's data, or a copy of it, write
						to
						<a href="mailto:hello@legwork.cloud" class="text-accent underline underline-offset-4"
							>hello@legwork.cloud</a
						>. Deleting your organization removes its incidents, analyses, and diagnoses.
					</p>
				</section>

				<section>
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						8. Changes and contact
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						If this policy changes materially, the effective date above changes and account
						administrators are notified. Questions about this policy, or about how your data is
						handled, go to
						<a href="mailto:hello@legwork.cloud" class="text-accent underline underline-offset-4"
							>hello@legwork.cloud</a
						>.
					</p>
				</section>
			</div>
		</div>
	</main>

	<SiteFooter />
</div>
