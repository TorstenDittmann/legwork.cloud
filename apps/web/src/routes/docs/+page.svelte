<script lang="ts">
	import Wordmark from '$lib/components/wordmark.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const signedIn = $derived(data.authState !== 'guest');
	const dashboardHref = $derived(signedIn ? '/dashboard' : '/sign-in');

	const toc = [
		{ href: '#ingest', label: 'Ingest an incident' },
		{ href: '#callbacks', label: 'Receive results' },
		{ href: '#notifications', label: 'Notification channels' }
	];

	const curlExample = `curl -X POST https://legwork.dev/api/v1/services/payments-api/incidents \\
  -H "Authorization: Bearer $LEGWORK_API_KEY" \\
  -H "Idempotency-Key: grafana-alert-8412" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "grafana-alert-8412",
    "title": "5xx spike on /checkout",
    "severity": "high",
    "occurredAt": "2026-08-20T14:02:00Z",
    "environment": "production",
    "description": "Error rate stepped from 0.2% to 14% at 14:02 UTC.",
    "stackTrace": "panic: read /var/cache/layers/3f2a: file already closed\\n\\tinternal/archive/reader.go:210\\n\\tinternal/cache/layers.go:94",
    "logs": [
      {
        "timestamp": "2026-08-20T14:02:11Z",
        "level": "error",
        "message": "archive read aborted: file already closed"
      }
    ],
    "context": { "region": "eu-west-1", "deploy": "0fab160216e8" }
  }'`;

	const responseExample = `{
  "incidentId": "6f1f6a2e-9c62-4d0a-8f3b-2b7e21d5c4a1",
  "runId": "b4d1c9f2-3e58-4a7c-9b21-d6f0a8e35c72",
  "status": "queued",
  "dashboardUrl": "https://legwork.dev/incidents/6f1f6a2e-9c62-4d0a-8f3b-2b7e21d5c4a1"
}`;

	const callbackExample = `{
  "schemaVersion": "1",
  "event": "analysis.completed",
  "incidentId": "6f1f6a2e-9c62-4d0a-8f3b-2b7e21d5c4a1",
  "runId": "b4d1c9f2-3e58-4a7c-9b21-d6f0a8e35c72",
  "status": "completed",
  "summary": "Concurrent cache eviction interrupts active archive reads. The evict path calls os.RemoveAll without coordinating with active readers (internal/cache/layers.go:94-107).",
  "confidence": 0.92,
  "dashboardUrl": "https://legwork.dev/incidents/6f1f6a2e-9c62-4d0a-8f3b-2b7e21d5c4a1",
  "completedAt": "2026-08-20T14:04:23Z"
}`;

	const verifyExample = `import { createHmac, timingSafeEqual } from 'node:crypto';

// rawBody must be the exact request body bytes as received,
// not a re-serialized copy of the parsed JSON.
function verifyLegworkSignature(headers, rawBody, secret) {
  const timestamp = headers['x-legwork-timestamp'];
  const signature = headers['x-legwork-signature'] ?? '';
  const expected = \`v1=\${createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex')}\`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}`;

	type Field = {
		name: string;
		type: string;
		required: boolean;
		description: string;
	};

	const requestFields: Field[] = [
		{
			name: 'externalId',
			type: 'string',
			required: true,
			description: 'Your identifier for the incident, such as the alert ID. 1–255 characters.'
		},
		{
			name: 'title',
			type: 'string',
			required: true,
			description: 'Short human-readable summary. 1–500 characters.'
		},
		{
			name: 'severity',
			type: 'string',
			required: true,
			description: 'One of critical, high, medium, low, or unknown.'
		},
		{
			name: 'occurredAt',
			type: 'string',
			required: true,
			description:
				'When the incident began, as an ISO 8601 timestamp with a timezone, for example 2026-08-20T14:02:00Z.'
		},
		{
			name: 'description',
			type: 'string',
			required: false,
			description: 'Free-form detail about what you observed. Up to 32,000 characters.'
		},
		{
			name: 'environment',
			type: 'string',
			required: false,
			description: 'For example production or staging. Up to 128 characters.'
		},
		{
			name: 'stackTrace',
			type: 'string',
			required: false,
			description: 'Raw stack trace text. Up to 128 KiB.'
		},
		{
			name: 'logs',
			type: 'array',
			required: false,
			description:
				'Up to 2,000 log entries. Each entry has a required message plus optional timestamp (ISO 8601 with timezone) and level.'
		},
		{
			name: 'primaryCommitSha',
			type: 'string',
			required: false,
			description:
				'Full 40-character hex SHA of the commit to investigate. When omitted, Legwork resolves the current head of the primary repository’s default branch.'
		},
		{
			name: 'context',
			type: 'object',
			required: false,
			description:
				'Flat key-value map for extra metadata. Keys up to 128 characters; values are strings (up to 4,096 characters), numbers, booleans, or null.'
		}
	];

	const statusCodes = [
		{
			code: '202',
			meaning:
				'Accepted. The incident is queued for analysis and the response body contains the IDs above. Retries with the same Idempotency-Key also return 202 with the original IDs.'
		},
		{
			code: '400',
			meaning: 'The Idempotency-Key header is missing or too long, or the body is not valid JSON.'
		},
		{
			code: '401',
			meaning: 'The bearer key is missing, invalid, revoked, or the service is disabled.'
		},
		{ code: '413', meaning: 'The request body exceeds 256 KiB.' },
		{
			code: '422',
			meaning:
				'Validation failed. The errors field maps each invalid field to its validation messages.'
		},
		{
			code: '429',
			meaning:
				'The per-service rate limit of 60 requests per minute was exceeded, or your organization’s monthly investigation or model-token quota is exhausted.'
		}
	];

	const callbackHeaders = [
		{
			name: 'x-legwork-event',
			value: 'analysis.completed, analysis.inconclusive, or analysis.failed.'
		},
		{
			name: 'x-legwork-delivery',
			value: 'Unique ID for this delivery. Use it to deduplicate retried deliveries.'
		},
		{
			name: 'x-legwork-timestamp',
			value: 'Unix timestamp in seconds at the moment of the sending attempt.'
		},
		{
			name: 'x-legwork-signature',
			value:
				'v1= followed by a hex HMAC-SHA256 of the timestamp and the raw request body, joined with a period, keyed with your callback signing secret.'
		},
		{ name: 'content-type', value: 'application/json.' }
	];
</script>

<svelte:head>
	<meta
		name="description"
		content="How to send incidents to the Legwork API and receive signed diagnosis callbacks: authentication, idempotency, rate limits, payload schema, and signature verification."
	/>
</svelte:head>

{#snippet codeBlock(label: string, code: string)}
	<div class="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
		<p class="border-b border-rule px-4 py-2.5 font-mono text-[11px] text-ink-faint">{label}</p>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<pre
			translate="no"
			tabindex="0"
			role="region"
			aria-label={label}
			class="overflow-x-auto bg-surface-raised px-4 py-4 font-mono text-[11px] leading-5 text-ink-muted">{code}</pre>
	</div>
{/snippet}

<div class="min-h-screen">
	<header class="border-b border-rule bg-canvas/90 backdrop-blur">
		<nav
			aria-label="Main"
			class="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-5 sm:px-8"
		>
			<a href="/" aria-label="Legwork home"><Wordmark /></a>
			<div class="flex items-center gap-2 sm:gap-5">
				<a href="/docs" aria-current="page" class="hidden text-sm font-medium text-ink sm:block">
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
			<p class="font-mono text-xs tracking-[0.14em] text-accent uppercase">Documentation</p>
			<h1
				class="mt-5 font-display text-4xl leading-[1.06] font-semibold tracking-[-0.02em] text-pretty text-ink sm:text-5xl"
			>
				API &amp; integration docs
			</h1>
			<p class="mt-5 text-base leading-7 text-ink-muted sm:text-lg">
				Everything on this page is the shipped behavior of the API: how to open an incident with
				your service key, and how to receive and verify the signed result.
			</p>
		</div>

		<div class="mt-12 gap-12 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
			<nav aria-label="On this page" class="hidden lg:sticky lg:top-8 lg:block">
				<p class="font-mono text-[11px] tracking-wide text-ink-faint uppercase">On this page</p>
				<ul class="mt-3 space-y-2 border-l border-rule">
					{#each toc as item (item.href)}
						<li>
							<a
								href={item.href}
								class="-ml-px block border-l border-transparent pl-4 text-sm text-ink-muted hover:border-rule-strong hover:text-ink"
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>

			<div class="max-w-3xl space-y-16">
				<section id="ingest" class="scroll-mt-8">
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
						Ingest an incident
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						Each service you create in the dashboard exposes one ingest endpoint, addressed by the
						service’s slug:
					</p>
					<div class="mt-4">
						{@render codeBlock('Endpoint', 'POST /api/v1/services/<service-slug>/incidents')}
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Authentication</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						Authenticate with the service API key as a bearer token. Keys have the form
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>ocai_live_…</code
						>
						and are generated when you create a service. The plaintext is shown once and only a hash is
						stored, so copy it at creation; you can rotate the key from the service’s settings at any
						time, which invalidates the old one.
					</p>
					<div class="mt-4">
						{@render codeBlock(
							'Required headers',
							'Authorization: Bearer ocai_live_…\nIdempotency-Key: <your key, up to 128 characters>\nContent-Type: application/json'
						)}
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Idempotency</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						The <code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>Idempotency-Key</code
						>
						header is required on every request and is limited to 128 characters. Use a value that identifies
						the alert, such as the alert ID from your monitoring system. Sending the same key to the same
						service again returns the original
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>incidentId</code
						>
						and
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>runId</code
						>
						instead of opening a second case, so a retrying alerting pipeline cannot duplicate work.
					</p>

					<h3 class="mt-8 text-base font-semibold text-ink">Request body</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						The body is JSON. Unknown fields are rejected, the whole request is limited to 256 KiB,
						and the stack trace plus all log messages together are limited to 128 KiB. Values that
						look like secrets — API keys, tokens, webhook URLs, private keys — are redacted before
						the payload is stored.
					</p>
					<div class="mt-4 overflow-x-auto rounded-xl border border-rule">
						<table class="w-full min-w-[640px] border-collapse text-left text-sm">
							<thead class="bg-surface-raised">
								<tr>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Field</th>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Type</th>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Description</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-rule bg-surface">
								{#each requestFields as field (field.name)}
									<tr>
										<th scope="row" class="px-4 py-3 align-top font-normal whitespace-nowrap">
											<code class="font-mono text-xs text-ink" translate="no">{field.name}</code>
											{#if field.required}
												<span class="ml-1.5 font-mono text-[10px] text-accent uppercase">
													required
												</span>
											{/if}
										</th>
										<td class="px-4 py-3 align-top font-mono text-xs text-ink-faint" translate="no">
											{field.type}
										</td>
										<td class="px-4 py-3 align-top text-xs leading-5 text-ink-muted">
											{field.description}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Example</h3>
					<div class="mt-3 space-y-4">
						{@render codeBlock('Open an incident', curlExample)}
						{@render codeBlock('202 Accepted', responseExample)}
					</div>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						A 202 means the incident is stored and an analysis run is queued. Follow
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>dashboardUrl</code
						> to watch the investigation live.
					</p>

					<h3 class="mt-8 text-base font-semibold text-ink">Rate limits and response codes</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						Each service accepts up to 60 incident requests per minute. Monthly investigation and
						model-token quotas from your plan also apply. Errors are returned as
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>application/problem+json</code
						>
						(RFC 9457) with a
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>title</code
						>
						and
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>detail</code
						>.
					</p>
					<div class="mt-4 overflow-x-auto rounded-xl border border-rule">
						<table class="w-full min-w-[560px] border-collapse text-left text-sm">
							<thead class="bg-surface-raised">
								<tr>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Status</th>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Meaning</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-rule bg-surface">
								{#each statusCodes as status (status.code)}
									<tr>
										<th scope="row" class="px-4 py-3 align-top font-normal">
											<code class="font-mono text-xs text-ink" translate="no">{status.code}</code>
										</th>
										<td class="px-4 py-3 align-top text-xs leading-5 text-ink-muted">
											{status.meaning}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>

				<section id="callbacks" class="scroll-mt-8 border-t border-rule pt-12">
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
						Receive results
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						If you configure a callback URL on a service, Legwork POSTs a signed JSON payload to it
						when a run reaches a terminal state. The callback signing secret is generated together
						with the service and shown once, next to the API key. The URL must be HTTPS on port 443,
						carry no credentials, and resolve to a public address — private and internal hosts are
						rejected.
					</p>

					<h3 class="mt-8 text-base font-semibold text-ink">Events and headers</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						One of three events is delivered per run:
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>analysis.completed</code
						>,
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>analysis.inconclusive</code
						>, or
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>analysis.failed</code
						>. Every request carries these headers:
					</p>
					<div class="mt-4 overflow-x-auto rounded-xl border border-rule">
						<table class="w-full min-w-[560px] border-collapse text-left text-sm">
							<thead class="bg-surface-raised">
								<tr>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Header</th>
									<th scope="col" class="px-4 py-3 font-medium text-ink-muted">Value</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-rule bg-surface">
								{#each callbackHeaders as header (header.name)}
									<tr>
										<th scope="row" class="px-4 py-3 align-top font-normal whitespace-nowrap">
											<code class="font-mono text-xs text-ink" translate="no">{header.name}</code>
										</th>
										<td class="px-4 py-3 align-top text-xs leading-5 text-ink-muted">
											{header.value}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Payload</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						The body carries the summary and a confidence score between 0 and 1 (both null when a
						run fails before producing a diagnosis). It deliberately omits logs, source excerpts,
						and patches; the full evidence trail stays behind
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>dashboardUrl</code
						>.
					</p>
					<div class="mt-4">
						{@render codeBlock('Callback body', callbackExample)}
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Verifying the signature</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						Compute an HMAC-SHA256 over the timestamp header and the raw request body joined with a
						period, using your callback signing secret. Prefix the hex digest with
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>v1=</code
						>
						and compare it to
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>x-legwork-signature</code
						> with a constant-time comparison:
					</p>
					<div class="mt-4">
						{@render codeBlock('Verify (Node.js)', verifyExample)}
					</div>

					<h3 class="mt-8 text-base font-semibold text-ink">Delivery and retries</h3>
					<p class="mt-2 text-sm leading-6 text-ink-muted">
						Respond with any 2xx status within 10 seconds. Anything else counts as a failed attempt
						and is retried after 1 minute, 5 minutes, 30 minutes, 2 hours, and 24 hours before the
						delivery is marked permanently failed. Retries reuse the same
						<code class="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink"
							>x-legwork-delivery</code
						> ID, so you can deduplicate on it.
					</p>
				</section>

				<section id="notifications" class="scroll-mt-8 border-t border-rule pt-12">
					<h2 class="font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-3xl">
						Notification channels
					</h2>
					<p class="mt-3 text-sm leading-6 text-ink-muted">
						If you would rather read findings where your team already is, add Slack, Discord, or
						email channels at
						<a href="/notifications" class="font-medium text-accent hover:underline"
							>/notifications</a
						>
						in the dashboard — no code required. Slack and Discord take an incoming webhook URL and work
						immediately; email channels deliver the finding by mail.
					</p>
					<ul class="mt-5 space-y-3 text-sm leading-6 text-ink-muted">
						<li class="flex gap-3">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							Each channel routes to every service by default; narrow it to specific services when you
							want separate destinations per team.
						</li>
						<li class="flex gap-3">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							<span>
								<strong class="font-medium text-ink">Send test</strong> posts a real message through the
								same delivery path a diagnosis takes, so you can confirm the wiring before the next incident.
							</span>
						</li>
						<li class="flex gap-3">
							<span aria-hidden="true" class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
							></span>
							Messages carry the summary, the root-cause statement with its confidence, and cited file
							paths with line ranges — never source excerpts or patches. The full trail stays behind the
							dashboard link.
						</li>
					</ul>
				</section>
			</div>
		</div>
	</main>

	<SiteFooter />
</div>
