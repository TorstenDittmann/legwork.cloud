# Agent handoff

## Objective

Legwork is a private-beta, multi-tenant incident-debugging SaaS. It accepts normalized incidents for a service, resolves approved GitHub repositories at immutable commit SHAs, analyzes source in a disposable sandbox through a constrained OpenRouter agent, presents an evidence-backed diagnosis, sends a signed callback, and removes retained incident content after 30 days.

## Current state

The MVP is implemented and tracked in git: `main` carries 13 merged pull requests with a green CI (`bun install --frozen-lockfile`, `bun run check`, `bun run build`, `bun audit --audit-level=high`).

Implemented architecture:

- Bun 1.4.0 as runtime and package manager, pinned through `mise.toml`, `engines`, and `packageManager`.
- SvelteKit (Svelte 5, Vite, `adapter-node`) web/API application; `bun run dev` serves it on port 5173.
- WorkOS AuthKit active-organization authentication with `admin` and `member` authorization.
- libSQL with Drizzle ORM and a custom durable leased-job queue. `DATABASE_URL` defaults to the local `file:local.db`; the remote database is a self-hosted libsql-server whose JWTs are minted with `bun run db:tokens`.
- Read-only GitHub App integration and exact-SHA archive retrieval.
- Two `SandboxProvider` implementations selected by `SANDBOX_PROVIDER`: sbx on gVisor (no network, worker-supplied archives) and the Railway Sandbox SDK pinned to `3.6.0` (still the default).
- `orch.pkl` and the root `Dockerfile` deploy web, worker and libSQL to orch.
- OpenRouter tool loop and structured diagnosis behind the model boundary; each analysis run is a durable LangGraph thread with libSQL checkpoints.
- Grafana and Sentry alert intake and provider connections (`packages/integrations`).
- Slack, Discord, and Resend email notification channels (`packages/notifications`).
- Dodo Payments billing: `/pricing`, hosted checkout, and signed subscription webhooks.
- Signed callbacks with DNS re-resolution, address pinning, SSRF rejection, and retries.
- Daily retention purge and 15-minute orphan-sandbox janitor.

Useful entry points:

- `README.md`: developer setup, orch deployment and the Railway deployment it replaces.
- `packages/db/src/schema.ts`: all 27 tables.
- `packages/db/src/incidents.ts`: atomic incident, quota reservation, idempotency, retry runs.
- `packages/db/src/jobs.ts`: queue singleton, lease recovery, deferral, retries.
- `apps/web/src/routes/api/v1/services/[serviceSlug]/incidents/+server.ts`: public ingestion API.
- `apps/worker/src/analysis.ts` and `apps/worker/src/analysis-graph.ts`: complete analysis lifecycle.
- `packages/sandbox/src/sbx-provider.ts` and `railway-provider.ts`: constrained sandbox adapters; `image/` holds the bootstrap and the check wrappers.
- `packages/sandbox/src/probe.ts`: mandatory real capability probe.
- `packages/agent/src/openrouter.ts`: model calls and required-parameter routing.
- `apps/worker/src/callbacks.ts`: callback construction and delivery.
- `apps/worker/src/maintenance.ts`: retention and orphan cleanup.

## Verified locally

The following passed on a clean `main` checkout (2026-08-20):

```sh
bun run test
bun run --filter @legwork/db generate
```

Results:

- 111 Vitest tests passed across 17 test files (including `fixtures/incident-evals`).
- Drizzle reported "No schema changes" beyond the ten checked-in migrations.
- CI on `main` is green; it runs `bun run check` (lint, typecheck, tests), `bun run build`, and `bun audit --audit-level=high` across all 12 workspaces.

Lint is split by surface: oxlint in the worker and packages, ESLint plus Prettier in `apps/web`. Formatting elsewhere is oxfmt (`bun run format:check`).

Do not run `svelte-kit sync` or a build while the web dev server is running; it breaks SSR route resolution.

## Not yet verified

These items require real staging credentials or external configuration and must not be marked complete based on mocks:

- WorkOS sign-in, organization creation, invitation, role update, and organization switching.
- GitHub App installation, repository webhooks, suspension/removal, token minting, and exact-SHA download.
- OpenRouter routing and the selected model's real tool/structured-output behavior.
- Callback delivery to a real public HTTPS endpoint, including all retry intervals.
- Sandbox create/upload/execute/destroy lifecycle on Railway and on a real sbx server. The sbx provider has not run against a real sbx server yet; its bootstrap path was exercised locally as a non-root user.
- The mandatory no-egress capability probe.
- Remote libSQL migration, concurrency behavior, and restore/backup retention policy.
- Browser end-to-end coverage: the Playwright suite was removed in commit `e8141d1` and nothing replaces it yet.
- The live 20-case agent-quality evaluation. Fixtures exist, but the current test only validates fixture attribution and coverage.
- Real Slack and Discord webhook delivery. Destination parsing, rendering, routing, and the retry state machine are unit-tested, but no message has been posted to a live webhook.
- Resend email delivery. It stays unsendable until a sending domain is verified; `legwork.dev` is a placeholder, so `RESEND_FROM_ADDRESS` has no verified domain behind it yet.
- Dodo Payments checkout, subscription webhooks, and customer portal against real products.

## Safe continuation order

1. Read all files in `docs/` and `.env.example`.
2. Create staging resources and scope secrets according to `ARCHITECTURE.md`.
3. Export `DATABASE_URL` (and `DATABASE_AUTH_TOKEN`) before `bun run db:migrate`; without them it migrates the local `file:local.db` and still exits 0.
4. Configure WorkOS roles and URLs, then test onboarding and cross-organization denial.
5. Configure the read-only GitHub App and run installation/webhook/exact-SHA tests.
6. Exercise OpenRouter with recorded fixtures and confirm privacy-route failure remains fail-closed.
7. Run `bun run --filter @legwork/sandbox probe` against the real sandbox provider (`SANDBOX_PROVIDER=sbx` for sbx).
8. Leave command execution disabled unless every probe assertion passes.
9. Rebuild an authenticated end-to-end suite and run the live agent evaluation.
10. Verify remote libSQL backup aging before making any public backup-deletion promise.

## Non-negotiable invariants

- Never derive `organizationId` from browser input.
- Never put GitHub credentials, OpenRouter credentials, or control-plane secrets in a sandbox.
- Never expose a generic shell tool to the model.
- Never enable online dependency installation in a sandbox.
- Never relax required model parameters after a routing failure; provider privacy filtering is deferred for the MVP.
- Never enable `run_check` from mocked probe results.
- Never persist repository archives outside the active sandbox.
- Never apply suggested patches or write to GitHub.
- Always destroy a created sandbox in `finally`; the janitor is recovery, not the primary cleanup path.
