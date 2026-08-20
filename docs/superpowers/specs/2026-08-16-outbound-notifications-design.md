# Outbound Notifications (Slack, Discord, Email)

Date: 2026-08-16
Status: approved (approach and all three design sections approved in conversation)

## Problem

A completed analysis has exactly two exits today: the dashboard at `/incidents/[incidentId]`,
and a signed HTTPS callback the customer must build a receiver for
(`apps/worker/src/callbacks.ts`). There is no delivery to where on-call engineers actually
are. The callback payload is deliberately thin — summary, confidence, and a `dashboardUrl` —
so even a customer who builds the receiver ends up redirecting a human to a browser tab
during an incident.

## Goal

Deliver each finished analysis to Slack, Discord, and email, with setup short enough that an
admin pastes one value and clicks one button. Routing defaults to "every service" so the
common case needs no further configuration.

Out of scope: Slack OAuth apps and channel pickers (the schema leaves room; see
`mode` below), interactive message actions, per-incident notification status on the incident
detail page, digests or batching, and any change to the existing HTTP callback path.

## Decisions

| Decision        | Choice                                              | Reason                                                                                                                                     |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Slack depth     | Incoming webhook URLs now, OAuth later              | Webhooks need no app review or token refresh, and make all three kinds structurally identical. A `mode` column leaves the OAuth door open. |
| Channel scope   | Org-level channel, optional per-service routing     | Mirrors `provider_connections` + `service_provider_bindings`. One webhook serves twelve services without pasting it twelve times.          |
| Message content | Summary, root cause, cited file paths — no excerpts | Actionable without leaving Slack, while no customer source code reaches a third party.                                                     |
| Email transport | Resend over plain HTTPS                             | No new dependency; the worker's `undici` client already does authenticated POSTs.                                                          |
| Subsystem shape | Parallel to callbacks, not merged                   | Independent failure domains: a dead Discord webhook must not consume a customer callback's retry budget.                                   |

## Design

### Schema (`packages/db/src/schema.ts`)

Three additive tables. Migration generated with
`bun run --filter @legwork/db generate`, landing as `0005_*.sql`.

```ts
notification_channels
  id, organizationId
  kind: "slack" | "discord" | "email"
  mode: text                    // "webhook" | "resend"; reserved for "oauth"
  name: text                    // display label, e.g. "#incidents"
  destinationCiphertext: text   // webhook URL or recipient address, encrypted
  destinationHint: text         // non-sensitive display form
  events: json                  // subset of analysis.completed|inconclusive|failed
  enabled: boolean default true
  lastVerifiedAt, lastVerificationError
  createdAt, updatedAt

notification_channel_services
  organizationId, channelId, serviceId
  PK(channelId, serviceId)

notification_deliveries
  id, organizationId, channelId
  runId: nullable                 // null for test deliveries, which have no run
  event: analysis.completed | analysis.inconclusive | analysis.failed | notification.test
  status: "pending" | "retrying" | "delivered" | "permanently_failed"
  attempt, error, responseStatus
  nextAttemptAt, deliveredAt, createdAt, updatedAt, expiresAt
  UNIQUE(channelId, runId) WHERE run_id IS NOT NULL
```

`runId` is nullable so a **Send test** click can travel the same delivery path as a real
notification. The unique index is partial — matching the existing
`integration_deliveries_provider_id_idx` pattern — so repeated tests against one channel are
allowed while real runs stay idempotent.

`events` on a new channel defaults to all three analysis events; the form lets an admin
narrow it. `notification.test` is never part of that subscription set and is only produced by
an explicit test action.

`destinationCiphertext` uses `encryptSecret(value, key, \`channel:${id}:destination\`)`,
matching `provider_connections.credentialsCiphertext`and`services.callbackSecretCiphertext`. A Slack or Discord webhook URL is an unscoped bearer
credential — anyone holding it can post to that channel indefinitely — so it is never stored
in plaintext. Email addresses are not credentials but are handled identically so there is one
code path.

`destinationHint` holds a display-safe form: `hooks.slack.com/…/B01xyz` for webhooks, a
masked local part for email.

**Routing rule:** a channel with zero rows in `notification_channel_services` matches every
service in the organization. Rows narrow it. This makes the default case configuration-free,
and avoids the failure where onboarding a new service silently stops notifying.

`notification_deliveries.expiresAt` joins the existing 30-day purge in
`apps/worker/src/maintenance.ts`. The unique index on `(channelId, runId)` makes enqueue
idempotent, mirroring the `existing` guard in `enqueueAutomaticCallback`.

### Payload contract (`packages/contracts`)

```ts
notificationPayloadSchema = {
	schemaVersion: "1",
	event,
	status,
	serviceName,
	incidentTitle,
	summary: string | null,
	rootCause: { statement: string, confidence: number } | null,
	citations: Array<{ repository: string; path: string; lineStart: number; lineEnd: number }>,
	dashboardUrl,
	completedAt,
};
```

`citations` carries file coordinates only. There is no `excerpt` field on the type, so an
adapter cannot render source text even by mistake. A single builder function populates the
payload by explicitly picking fields off the stored diagnosis; it never spreads the diagnosis
object.

`diagnosisEvidenceSchema` is a union: repository-file evidence carries
`repositoryId`/`path`/`lineStart`/`lineEnd`/`excerpt`, while GitHub-activity evidence carries
no file coordinates. Only the repository-file variant becomes a citation; activity evidence is
omitted rather than rendered as a partial entry. `citations` is capped at the first five so a
diagnosis with fifty evidence items cannot produce an unreadable Slack message.

A second builder, `buildTestPayload(channel)`, produces a fixed synthetic payload for **Send
test** with no incident data in it.

### Adapters (`packages/notifications`, new)

New package, sibling to `@legwork/integrations` — which stays scoped to _inbound_ alerts and
investigation-context queries. All three kinds reduce to an authenticated HTTPS POST:

```ts
interface NotificationAdapter {
	kind: NotificationChannelKind;
	parseDestination(raw: string): { destination: string; hint: string };
	buildRequest(
		destination: string,
		payload: NotificationPayload,
	): { url: URL; headers: Record<string, string>; body: string };
}
```

- **Slack** — POST the webhook URL, Block Kit body.
- **Discord** — POST the webhook URL, embed body.
- **Email** — POST `https://api.resend.com/emails` with a bearer key; `to` is the stored
  recipient, `from` is `RESEND_FROM_ADDRESS`; text and HTML parts.

`parseDestination` enforces a per-kind host allowlist, which is deliberately stricter than
`resolveSafeCallbackUrl` (that function must permit any public host, because customer ingest
endpoints live anywhere):

- slack: host exactly `hooks.slack.com`, path begins `/services/`, scheme `https:`
- discord: host exactly `discord.com` or `discordapp.com`, path begins `/api/webhooks/`,
  scheme `https:`
- email: input is an address, never a URL; the request target is the fixed Resend host

Host comparison uses exact match, not suffix match, so `hooks.slack.com.evil.com` is
rejected. The existing SSRF address pinning still runs underneath as defense in depth.

Payloads pass through `redactSecrets` from `@legwork/security` before rendering.

### Delivery (`apps/worker/src/notifications.ts`)

`deliverNotification(deliveryId, appUrl, encryptionKey, resendKey)` mirrors `deliverCallback`
minus HMAC signing: load the delivery joined to its channel, run, incident, service, and
diagnosis; skip if already delivered; decrypt the destination; build and POST the request;
record the outcome.

Worker wiring in `apps/worker/src/index.ts`:

- `enqueueNotifications(runId)` is called immediately after `enqueueAutomaticCallback(runId)`
  in both the success path and the attempts-exhausted failure path of the `analyze-incident`
  queue. It resolves matching channels (enabled, event subscribed, routing match), inserts
  one `notification_deliveries` row per channel, and enqueues one `deliver-notification` job
  per row with the delivery id as its singleton key.
- A new `pollQueue("deliver-notification", { concurrency: 10, leaseMs: 60_000, … })` handles
  those jobs, with an `onFailure` that marks the row `permanently_failed` when the queue stops
  retrying — the same structure the `deliver-callback` queue already uses.

**Retry ladder: 30s, 2m, 10m, then `permanently_failed`.** Callbacks use
1m/5m/30m/2h/24h because a customer's ingest endpoint being down for a day is worth
surviving. A notification that arrives a day after the incident is noise, so the ladder is
short by design.

Two status-specific rules:

- **429** honors the provider's `Retry-After` header instead of the ladder, clamped to 15
  minutes so a hostile or malformed header cannot park a job. Slack allows roughly one
  message per second per webhook; Discord allows five.
- **Any other 4xx fails permanently on the first attempt.** A deleted webhook returns 404 or
  403 forever; retrying delays telling the user their channel is broken. The error is written
  to `notification_channels.lastVerificationError` so the dashboard can flag it.

5xx and transport errors use the ladder. Each channel has its own delivery row and job, so one
broken destination cannot affect another channel or the HTTP callback.

### Dashboard (`apps/web/src/routes/(dashboard)/notifications`)

New route, sibling to `connections`, added to `app-navigation.svelte`. Mutations are
admin-gated the way the settings page gates on `data.role === 'admin'`.

The list shows each channel's kind, `destinationHint`, routing summary ("all services" or a
count), event filter, enabled state, verified state, and last error. The add form mirrors
`add-connection-form.svelte`: choose kind, paste destination, name it, optionally select
services.

**Send test** enqueues a real delivery through the real adapter against a synthetic payload,
so a green check means the entire path works rather than that a URL parsed. Channels save
unverified and flip to verified when the test delivery succeeds, reusing the
`lastVerifiedAt` / `lastVerificationError` pattern from `verifyRecord` in
`connections/+page.server.ts`.

The form includes a one-line pointer to where each destination comes from (Slack: app
settings → Incoming Webhooks; Discord: channel settings → Integrations → Webhooks).

**Secret boundary:** the web action enqueues the test delivery; the worker sends it.
`RESEND_API_KEY` stays worker-only alongside `OPENROUTER_API_KEY` and the Railway token, per
the allocation table in `ARCHITECTURE.md`. The worker polls at one-second intervals, so the
button still feels immediate. The web service never holds a platform mail credential.

## Testing

Unit tests follow `packages/integrations/src/adapters.test.ts`, with an injected request
function so no test touches the network.

1. `parseDestination` — accepts each real host; rejects `evil.com`, `http://` schemes,
   `hooks.slack.com.evil.com`, and `discord.com/not-a-webhook`. Email rejects newlines in the
   address (header injection).
2. **No-excerpt invariant** — build a payload from a fixture diagnosis containing a known
   excerpt string, render all three bodies, assert the string appears in none.
3. Renderers — body shape per kind for completed, inconclusive, and failed runs.
4. Citation selection — repository-file evidence becomes citations, GitHub-activity evidence
   is dropped, and more than five evidence items truncate to five.
5. Routing — a channel with no bindings matches every service; with bindings matches only
   those; disabled channels and unsubscribed events match nothing.
6. Delivery state machine — 2xx delivers; 429 retries at `Retry-After`; 404 fails permanently
   on attempt one; 5xx follows the ladder; exhaustion marks `permanently_failed`.
7. Idempotency — enqueueing twice for one `(channelId, runId)` yields one delivery, while two
   test deliveries against one channel both persist.

Requires live credentials and therefore belongs in the `HANDOFF.md` "not yet verified" list:
real Slack and Discord webhook delivery, and Resend sending against a verified domain.

## Operational notes

- New worker-only env: `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`. Add to `.env.example`, the
  README, and the secret allocation section of `ARCHITECTURE.md`.
- **Email cannot work end to end until a sending domain is verified in Resend.** `legwork.dev`
  is still a placeholder. Slack and Discord work as soon as the code ships; email needs DNS
  first.
- Applying the migration to production requires `DATABASE_URL` exported in the environment.
  Without it, `db:migrate` migrates `./local.db` and exits 0, reporting success.
