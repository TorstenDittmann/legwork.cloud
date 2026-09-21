# Implementation plan

## Product scope

The MVP supports this lifecycle:

1. An organization admin connects a read-only GitHub App and selects repositories.
2. An admin creates a service with one primary and up to two related repositories.
3. The service receives one active ingestion key and a callback signing secret, each shown only at creation or rotation.
4. A member submits an incident manually or a caller posts it to the versioned service webhook.
5. The API validates and redacts the payload, reserves quota, persists the incident/run, and atomically inserts a durable analysis job.
6. The worker resolves all repositories to exact SHAs and streams validated archives into one disposable Railway Sandbox.
7. The OpenRouter agent may list, search, and read bounded source or request one fixed offline check.
8. Evidence is validated against the uploaded snapshot before the structured diagnosis is stored.
9. The sandbox is destroyed, and a signed completion callback is queued when configured.
10. Incident content expires after 30 days; aggregate usage without source or incident content remains.

## Approved technology decisions

- Bun 1.4.0 as the runtime and package manager.
- TypeScript strict mode in a Bun workspace; Bun is pinned through mise.
- SvelteKit (Svelte 5), Tailwind CSS, and local shadcn-style components.
- libSQL with Drizzle ORM.
- Custom libSQL-backed jobs with singleton keys, leases, lease recovery, deferral, and bounded attempts.
- WorkOS AuthKit Organizations and `admin`/`member` roles.
- Read-only GitHub App; no OAuth token or personal access token storage.
- Railway Sandbox SDK `3.6.0` behind a provider interface.
- OpenRouter model from `OPENROUTER_MODEL`, defaulting to `deepseek/deepseek-v4-flash-0731`.
- Vitest; the Playwright end-to-end suite was removed in commit `e8141d1`.

## Repository layout

```text
apps/
  web/                    SvelteKit UI, authenticated routes, public API
  worker/                 Durable jobs, analysis, callbacks, cleanup
packages/
  contracts/              Zod API, callback, tool, result, provider contracts
  db/                     libSQL/Drizzle schema, migrations, tenant queries, jobs
  auth/                   WorkOS session and role helpers
  github/                 GitHub App auth, state, webhooks, source provider
  integrations/           Grafana and Sentry alert intake, provider connections
  notifications/          Slack, Discord, and email delivery channels
  sandbox/                Railway + local Docker providers, commands, template, capability probe
  agent/                  OpenRouter provider, prompts, orchestration, evidence
  security/               Redaction, encryption, archives, paths, SSRF, HMAC
  observability/          Structured logs and Prometheus-style metrics
fixtures/
  incident-evals/         TypeScript, Python, and Go seeded cases
docs/                     Handoff, architecture, plan, acceptance state
```

## Product surface

Implemented pages and flows:

- Public landing page and hosted WorkOS sign-in.
- Organization onboarding.
- GitHub installation flow and repository synchronization/selection.
- Services list, creation, editing, enable/disable, repository mapping, and key rotation.
- Incident list with status, severity, service, and date-range filters.
- Incident detail with polling, activity, diagnosis, evidence, suggested fix, limitations, checks, callback state, and retry.
- Manual incident form.
- Organization settings with usage, active API key prefixes, WorkOS members/invitations, and audit events.

Authorization rules:

- Admins manage GitHub, repositories, services, keys, callbacks, and members.
- Members view incidents, submit manual incidents, and retry failed/inconclusive analyses.
- API and UI queries always derive the application tenant from the authenticated WorkOS organization or service credential.

## Public incident API

Endpoint:

```http
POST /api/v1/services/{serviceSlug}/incidents
Authorization: Bearer ocai_live_<secret>
Idempotency-Key: <required, <=128 characters>
Content-Type: application/json
```

Important behavior:

- Maximum request body: 256 KiB.
- Combined logs and stack trace: 128 KiB.
- No attachments or caller-provided URLs.
- 60 requests per minute per service.
- Duplicate retained idempotency keys return the original incident/run identifiers.
- Accepted requests return HTTP 202.
- Failures use RFC 9457-style `application/problem+json` responses.
- Incident creation, usage reservation, and durable-job insertion share one immediate transaction.

## Run lifecycle

Run states:

```text
queued -> provisioning -> analyzing -> completed
                                   \-> inconclusive
                                   \-> failed
queued/provisioning/analyzing      \-> cancelled
```

Defaults:

- Five worker jobs globally.
- Two active analyses per organization.
- Ten-minute analysis limit.
- Twenty model tool turns.
- Two-minute fixed-check limit.
- 64 KiB retained command output.
- Initial attempt plus two automatic infrastructure retries.
- Organization-capacity deferrals do not consume retry attempts.
- User retries create a new run linked through `retryOfRunId`.

## Delivery phases and status

### Phase 1: foundation — implemented

- Monorepo, CI, Railway configs, mise, Bun pin.
- libSQL schema and initial migration.
- WorkOS tenant and role helpers.
- Tenant-scoped query patterns.

### Phase 2: GitHub and services — implemented, live validation pending

- Signed installation state.
- Installation and repository webhook processing.
- Repository synchronization and selection.
- Service repository mapping and one-time secrets.
- Worker-only installation-token minting.

### Phase 3: ingestion and queue — implemented

- Versioned API and manual form.
- Payload limits, redaction, API-key hashing, rate limiting.
- Idempotency and transactional quota reservation.
- Durable queue, leases, singleton keys, crash recovery, retries, and capacity deferral.

### Phase 4: sandbox — implemented, mandatory staging gate pending

- Railway and local Docker providers and template.
- Streamed archive extraction with shared limits and one-file backpressure.
- Bounded static inspection tools.
- Fixed ecosystem check mapping.
- No-egress/privilege/timeout/destruction probe.
- Fail-closed command gate.

### Phase 5: model agent — implemented, live quality evaluation pending

- OpenRouter tool calls with `parallel_tool_calls: false`.
- Required-parameter routing with provider fallbacks; provider privacy filters and per-request ZDR are deferred beyond the MVP.
- Strict structured diagnosis.
- Bounded tool loop and one repair attempt.
- Evidence path, range, and excerpt validation.

### Phase 6: dashboard — implemented, authenticated E2E expansion pending

- Incident filters and live detail polling.
- Agent activity, evidence, limitations, checks, fix suggestion.
- Callback status and retries.
- Service editor and organization settings.

### Phase 7: callbacks and lifecycle — implemented, live validation pending

- Encrypted callback secrets.
- HMAC headers and restricted callback body.
- DNS re-resolution, public-address checks, and pinned delivery address.
- Retry schedule; the manual resend UI is not yet implemented.
- Retention purge and orphan-sandbox janitor.

### Phase 8: staging security and evaluation — pending

- Real external integration suite.
- Mandatory Railway capability probe.
- Adversarial repositories.
- Live 20-case agent evaluation and scoring.
- Full authenticated E2E suite.
- libSQL backup-retention verification.

### Phase 9: private beta — pending

- Enable selected organizations by setting `beta_allowlisted` administratively.
- Monitor queue leases, sandbox destruction, purge metrics, callback failures, and token reconciliation.
- Do not enable public signup or command execution until staging gates pass.

## Out of scope

- Native PagerDuty, Datadog, or Opsgenie adapters.
- Observability-provider credentials or direct production-system access.
- GitHub writes, branches, commits, pull requests, or comments.
- Arbitrary shell access, online installs, or persistent runners.
- Customer-selected models, Stripe, regional deployments, or self-hosting.
