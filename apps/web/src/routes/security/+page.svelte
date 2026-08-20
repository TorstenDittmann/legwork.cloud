<script lang="ts">
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');

	type Section = { id: string; title: string; paragraphs?: string[]; points?: string[] };

	const sections: Section[] = [
		{
			id: 'source-access',
			title: 'Source access is read-only',
			paragraphs: [
				'Legwork connects to your repositories through a GitHub App with read-only permissions: repository metadata, contents, Actions, and Deployments. It cannot push, open pull requests, or change anything in your repositories.',
				'Installation tokens are short-lived and minted per analysis, only to resolve the exact commit and obtain temporary archive downloads. Neither the tokens nor the GitHub App private key ever enter an analysis sandbox, and repositories are never stored in our database — source exists only inside the active sandbox.'
			]
		},
		{
			id: 'sandboxes',
			title: 'Disposable analysis sandboxes',
			paragraphs: [
				'Every analysis runs in its own disposable sandbox, created for that run and destroyed when it finishes — including when it fails. The working copy of your code is gone with it.',
				'Inside the sandbox, no network access: agent inspection runs in a network namespace with no egress, and a capability probe verifies that DNS, public HTTP, private networks, and cloud metadata endpoints are unreachable from that boundary before command execution can ever be enabled.',
				'Executing repository code is disabled by default. It stays disabled unless the full capability probe has passed in the target environment and two explicit configuration gates are set; otherwise the agent is limited to bounded static inspection — listing, searching, and reading files.'
			]
		},
		{
			id: 'data-protection',
			title: 'Stored credentials and secret redaction',
			points: [
				'Callback signing secrets and notification webhook URLs are stored encrypted with AES-256-GCM.',
				'Service API keys are stored only as SHA-256 hashes; the plaintext is shown once at creation.',
				'Inbound incident payloads are scanned for secret-shaped values — API keys, tokens, webhook URLs, private keys — and redacted before they are stored.',
				'Outbound callbacks and notification messages are redacted again on the way out, so a secret quoted in model output never leaves the system.'
			]
		},
		{
			id: 'retention',
			title: '30-day retention',
			paragraphs: [
				'Incident payloads, analysis runs, agent steps, diagnoses, and callback and notification delivery records expire 30 days after the run is created. A daily purge deletes expired records. Aggregate usage counters, which contain no prompt, source, log, or diagnosis content, are what remains for billing.'
			]
		},
		{
			id: 'outbound',
			title: 'Outbound delivery is SSRF-safe',
			points: [
				'Callback URLs must be credential-free HTTPS on port 443.',
				'DNS is resolved freshly for every delivery; loopback, private, link-local, and other non-public answers are rejected, and the approved address is pinned for the request to resist DNS rebinding.',
				'Every callback is signed with HMAC-SHA256 over the timestamp and body so you can authenticate it.',
				'Slack and Discord notification webhooks are allowlisted to their exact official hosts.'
			]
		},
		{
			id: 'tenancy',
			title: 'Tenant isolation',
			paragraphs: [
				'Every customer-owned record carries its organization ID, and queries always combine record IDs with the organization derived from the authenticated session or service key. Organization IDs supplied by the browser are never accepted as authority.'
			]
		},
		{
			id: 'model-boundary',
			title: 'What the model sees',
			paragraphs: [
				'Analysis requests to the model carry the incident context and only the specific file excerpts and tool output the investigation requested — never whole repositories. Complete conversations and hidden reasoning are not persisted, and every citation in a diagnosis is validated against the actual source snapshot before the result is stored.'
			]
		}
	];
</script>

<svelte:head>
	<meta
		name="description"
		content="How Legwork protects your code and data: read-only GitHub access, disposable no-egress sandboxes, encrypted credentials, secret redaction, 30-day retention, and SSRF-safe delivery."
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
		<div class="max-w-2xl">
			<p class="font-mono text-xs tracking-[0.14em] text-accent uppercase">Security</p>
			<h1
				class="mt-5 font-display text-4xl leading-[1.06] font-semibold tracking-[-0.02em] text-pretty text-ink sm:text-5xl"
			>
				The security model
			</h1>
			<p class="mt-5 text-base leading-7 text-ink-muted sm:text-lg">
				Legwork reads code to diagnose incidents, which means you are trusting it with source
				access. This page describes, plainly, how that access is constrained.
			</p>
		</div>

		<div class="mt-14 max-w-3xl space-y-12">
			{#each sections as section (section.id)}
				<section id={section.id} class="scroll-mt-8 border-t border-rule pt-8">
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
						{section.title}
					</h2>
					{#if section.paragraphs}
						{#each section.paragraphs as paragraph (paragraph)}
							<p class="mt-3 text-sm leading-6 text-ink-muted">{paragraph}</p>
						{/each}
					{/if}
					{#if section.points}
						<ul class="mt-4 space-y-3">
							{#each section.points as point (point)}
								<li class="flex gap-3 text-sm leading-6 text-ink-muted">
									<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
									></span>
									{point}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}

			<section id="contact" class="scroll-mt-8 border-t border-rule pt-8">
				<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
					Reporting and questions
				</h2>
				<p class="mt-3 text-sm leading-6 text-ink-muted">
					If you believe you have found a vulnerability, or you have questions this page does not
					answer, email
					<a href="mailto:hello@legwork.cloud" class="font-medium text-accent hover:underline"
						>hello@legwork.cloud</a
					>. We read every report.
				</p>
			</section>
		</div>
	</main>

	<SiteFooter />
</div>
