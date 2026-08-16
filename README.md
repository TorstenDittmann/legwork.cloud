# Legwork

Evidence-backed, read-only incident diagnosis for approved GitHub repositories. Each analysis resolves immutable commit SHAs, gives a disposable Railway Sandbox temporary archive download capabilities, runs a durable LangGraph workflow, validates every evidence citation, and destroys the sandbox.

For project continuation and implementation status, start with [`docs/HANDOFF.md`](./docs/HANDOFF.md). The documentation index is at [`docs/README.md`](./docs/README.md).

## Architecture

- `apps/web`: Next.js 16 App Router dashboard and versioned HTTP API.
- `apps/worker`: SQLite-backed leased job worker, durable LangGraph analysis lifecycle, callbacks, and cleanup.
- `packages/db`: Drizzle schema for Bun SQLite, migrations, tenant queries, quotas, idempotency, and durable jobs.
- `packages/auth`: WorkOS AuthKit active-organization and `admin`/`member` enforcement.
- `packages/github`: signed installation state, webhook verification, short-lived installation tokens, exact-SHA archives.
- `packages/sandbox`: Railway SDK `3.6.0` provider and mandatory no-egress capability probe.
- `packages/agent`: OpenRouter model boundary, strict structured output, and evidence validation.

LangGraph checkpoints and pending writes live in the same Bun SQLite database as incidents and expire with their analysis run. LangSmith tracing is explicitly disabled; no LangSmith key or external checkpoint service is used.

- `packages/notifications`: Slack, Discord, and email channel adapters, destination allowlisting, and delivery retry rules.
- `packages/security`: redaction, API keys, authenticated encryption, archive/path limits, callback HMAC, and SSRF controls.

Bun 1.3.14 is the project runtime and package manager through `mise.toml`.

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

## Sandbox command gate

Repository code execution is disabled by default. With Railway Sandbox credentials configured, run:

```sh
bun run --filter @legwork/sandbox probe
```

The probe creates a real sandbox and checks file transfer, execution, DNS, public HTTP, Railway private DNS, metadata endpoints, UID/capability isolation, namespace reconfiguration, secret visibility, timeout termination, and destruction. Set both of these only after the complete probe returns `passed: true` in the target environment:

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
