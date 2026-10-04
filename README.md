# Legwork

Evidence-backed, read-only incident diagnosis for approved GitHub repositories. Each analysis resolves immutable commit SHAs, streams validated archives into a disposable sandbox, runs a durable LangGraph workflow, validates every evidence citation, and destroys the sandbox.

For project continuation and implementation status, start with [`docs/HANDOFF.md`](./docs/HANDOFF.md). The documentation index is at [`docs/README.md`](./docs/README.md).

## Architecture

- `apps/web`: SvelteKit (Svelte 5) dashboard and versioned HTTP API.
- `apps/cli`: reactive command wrapper and incident ingestion CLI.
- `apps/worker`: SQLite-backed leased job worker, durable LangGraph analysis lifecycle, callbacks, and cleanup.
- `packages/db`: Drizzle schema for libSQL, migrations, tenant queries, quotas, idempotency, and durable jobs.
- `packages/auth`: WorkOS AuthKit active-organization and `admin`/`member` enforcement.
- `packages/github`: signed installation state, webhook verification, short-lived installation tokens, exact-SHA archives.
- `packages/sandbox`: Docker + gVisor and Railway Sandbox providers, the shared sandbox image scripts, and the mandatory no-egress capability probe.
- `packages/agent`: OpenRouter model boundary, strict structured output, and evidence validation.
- `packages/contracts`: Zod contracts for agents, incidents, providers, callbacks, notifications, and problem responses.
- `packages/integrations`: Grafana and Sentry alert intake, provider connections, and discovery.
- `packages/notifications`: Slack, Discord, and email channel adapters, destination allowlisting, and delivery retry rules.
- `packages/observability`: structured logs and Prometheus-style metrics.
- `packages/security`: redaction, API keys, authenticated encryption, archive/path limits, callback HMAC, and SSRF controls.

LangGraph checkpoints and pending writes live in the same libSQL database as incidents and expire with their analysis run. LangSmith tracing is explicitly disabled; no LangSmith key or external checkpoint service is used.

Bun 1.4.0 is the project runtime and package manager through `mise.toml`.

## Local setup

1. Copy `.env.example` to `.env.local` and fill the required values.
2. Set `DATABASE_URL` if you do not want the default `file:local.db`, then run `bun run db:migrate`. Set `DATABASE_AUTH_TOKEN` when the remote endpoint requires authentication.
3. In WorkOS AuthKit, configure the callback as `http://localhost:5173/auth/callback`, the sign-in URL as `http://localhost:5173/sign-in`, and create immutable `admin` and `member` role slugs. Set `member` as the default role.
4. Create a read-only GitHub App with repository metadata, contents, Actions, and Deployments read permissions plus `installation` and `installation_repositories` webhooks. Configure its setup callback as `/api/github/callback` and webhook URL as `/api/github/webhook`.
5. Start the web and worker processes:

```sh
bun run dev
bun run --filter @legwork/worker dev
```

Organizations can reserve analysis usage immediately after onboarding, subject to their configured monthly quotas.

## CLI

The CLI turns a failed command into an incident without changing normal command behavior. It streams
stdout and stderr as usual, submits the bounded output only after a non-zero exit, and returns the
original exit code.

```sh
bun run --filter @legwork/cli build
cd apps/cli
bun link

legwork configure --service payments-api
legwork run --environment production -- bun test
```

See [`apps/cli/README.md`](./apps/cli/README.md) for CI configuration, direct incident submission,
security behavior, and removal instructions.

## Billing

The public pricing page lives at `/pricing`. Paid Team and Scale checkouts use Dodo Payments
hosted checkout sessions, and signed subscription webhooks update the organization quotas. Create
monthly and annual recurring products in the Dodo dashboard, set the eight `DODO_PAYMENTS_*`
values shown in `.env.example`, and register this HTTPS webhook endpoint:

```text
https://your-domain.example/api/billing/dodo/webhook
```

Subscribe it to the subscription lifecycle events (`active`, `updated`, `renewed`, `on_hold`,
`paused`, `unpaused`, `plan_changed`, `cancelled`, `failed`, and `expired`). The displayed prices
and enforced entitlements share the typed configuration in `apps/web/src/lib/pricing.ts`; keep the
Dodo product prices aligned with that file. Use `test_mode` and Dodo's webhook tester before
switching the credentials and environment to `live_mode`.

## Notification channels

Add Slack, Discord, or email destinations at `/notifications`. Slack and Discord take an incoming
webhook URL and work immediately; email requires `RESEND_API_KEY` and `RESEND_FROM_ADDRESS` on the
worker plus a sending domain verified in Resend. Each channel routes to every service unless you
narrow it, and **Send test** posts a real message through the same path a diagnosis takes.

## Railway deployment

Create two Railway services from this repository and use these commands:

| Service | Build                                    | Start                                    | Health         |
| ------- | ---------------------------------------- | ---------------------------------------- | -------------- |
| Web     | `bun run --filter @legwork/web build`    | `bun run --filter @legwork/web start`    | `/api/health`  |
| Worker  | `bun run --filter @legwork/worker build` | `bun run --filter @legwork/worker start` | process health |

Both services use the same remote libSQL `DATABASE_URL`; local development uses `file:local.db`. Only the worker receives the GitHub private key and OpenRouter key. The web service receives WorkOS credentials and GitHub webhook/setup secrets. Scope shared values narrowly in Railway rather than exposing all secrets to both services.

## Sandbox runtime

`SANDBOX_PROVIDER` selects where analyses run:

- `railway` (default for now): Railway Sandboxes, created from the template in `packages/sandbox/src/template.ts`. Needs `RAILWAY_TOKEN`.
- `docker`: one container per analysis under gVisor, with no network interface at all. The worker streams each exact-SHA archive into the container, so it needs outbound access to `codeload.github.com` and access to a Docker daemon that has the `runsc` runtime registered. The image is built from `packages/sandbox/image` on first start, or ahead of time with `bun run --filter @legwork/sandbox image:build`.

To run the Docker provider locally without gVisor, set `SANDBOX_DOCKER_RUNTIME=runc`. Static inspection works, but `run_check` stays unavailable and the probe fails its `isolatedRuntime` assertion, by design.

## Sandbox command gate

Repository code execution is disabled by default. With the target sandbox provider configured, run:

```sh
bun run --filter @legwork/sandbox probe
```

The probe creates a real sandbox on the configured provider and checks file transfer, execution, DNS, public HTTP, private DNS and private-network HTTP, metadata endpoints, UID/capability isolation, namespace reconfiguration, secret visibility, timeout termination, and destruction. On Docker it also requires the gVisor runtime and a disabled network. Set both of these only after the complete probe returns `passed: true` in the target environment:

```sh
SANDBOX_COMMAND_EXECUTION=true
SANDBOX_CAPABILITY_PROBE_PASSED=true
```

If either value is absent or false, `run_check` returns a structured limitation and only bounded static inspection is available.

## Verification

```sh
bun run typecheck
bun run test
bun run build
bun audit
```

Live GitHub, OpenRouter, WorkOS, callback, and Railway lifecycle checks require staging credentials. Never enable command execution from mocked probe results. Define and test volume snapshot and restore procedures before publishing a backup-deletion window.
