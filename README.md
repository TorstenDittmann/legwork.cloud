# OnCall AI

Evidence-backed, read-only incident diagnosis for approved GitHub repositories. Each analysis resolves immutable commit SHAs, streams source into a disposable Railway Sandbox, uses a typed OpenRouter tool loop, validates every evidence citation, and destroys the sandbox.

For project continuation and implementation status, start with [`docs/HANDOFF.md`](./docs/HANDOFF.md). The documentation index is at [`docs/README.md`](./docs/README.md).

## Architecture

- `apps/web`: Next.js 16 App Router dashboard and versioned HTTP API.
- `apps/worker`: Turso-backed leased job worker, GitHub retrieval, analysis orchestration, callbacks, and cleanup.
- `packages/db`: Drizzle schema for Turso/libSQL, migrations, tenant queries, quotas, idempotency, and durable jobs.
- `packages/auth`: WorkOS AuthKit active-organization and `admin`/`member` enforcement.
- `packages/github`: signed installation state, webhook verification, short-lived installation tokens, exact-SHA archives.
- `packages/sandbox`: Railway SDK `3.6.0` provider and mandatory no-egress capability probe.
- `packages/agent`: OpenRouter tool loop, strict structured output, and evidence validation.
- `packages/security`: redaction, API keys, authenticated encryption, archive/path limits, callback HMAC, and SSRF controls.

Node 24 and pnpm 10.26 are the project defaults through `mise.toml`; Node 22 remains supported by the application engine range.

## Local setup

1. Copy `.env.example` to `.env.local` and fill the required values.
2. Create a Turso database, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then run `pnpm db:migrate`. A local `file:local.db` URL also works for development.
3. In WorkOS AuthKit, configure the callback as `http://localhost:3000/auth/callback`, the sign-in URL as `http://localhost:3000/sign-in`, and create immutable `admin` and `member` role slugs. Set `member` as the default role.
4. Create a read-only GitHub App with repository metadata and contents permissions plus `installation` and `installation_repositories` webhooks. Configure its setup callback as `/api/github/callback` and webhook URL as `/api/github/webhook`.
5. Start the web and worker processes:

```sh
pnpm dev
pnpm --filter @oncall-ai/worker dev
```

The organization table defaults to `beta_allowlisted = false`. Enable invited beta organizations administratively before they can reserve analysis usage.

## Railway deployment

Create two Railway services from this repository and use these commands:

| Service | Build | Start | Health |
| --- | --- | --- | --- |
| Web | `pnpm install --frozen-lockfile && pnpm --filter @oncall-ai/web build` | `pnpm --filter @oncall-ai/web start` | `/api/health` |
| Worker | `pnpm install --frozen-lockfile && pnpm --filter @oncall-ai/worker build` | `pnpm --filter @oncall-ai/worker start` | process health |

Both services use Turso. Only the worker receives the GitHub private key, OpenRouter key, and Railway token. The web service receives WorkOS credentials, GitHub webhook/setup secrets, and the data-encryption key. Scope shared values narrowly in Railway rather than exposing all secrets to both services.

## Sandbox command gate

Repository code execution is disabled by default. With Railway Sandbox credentials configured, run:

```sh
pnpm --filter @oncall-ai/sandbox probe
```

The probe creates a real sandbox and checks file transfer, execution, DNS, public HTTP, Railway private DNS, metadata endpoints, UID/capability isolation, namespace reconfiguration, secret visibility, timeout termination, and destruction. Set both of these only after the complete probe returns `passed: true` in the target environment:

```sh
SANDBOX_COMMAND_EXECUTION=true
SANDBOX_CAPABILITY_PROBE_PASSED=true
```

If either value is absent or false, `run_check` returns a structured limitation and only bounded static inspection is available.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit
```

Live GitHub, OpenRouter, WorkOS, callback, and Railway lifecycle checks require staging credentials. Never enable command execution from mocked probe results. Do not publish a backup-deletion window until the deployed Turso backup policy has been verified.
