# Agent handoff

## Objective

Legwork is a private-beta, multi-tenant incident-debugging SaaS. It accepts normalized incidents for a service, resolves approved GitHub repositories at immutable commit SHAs, analyzes source in a disposable Railway Sandbox through a constrained OpenRouter agent, presents an evidence-backed diagnosis, sends a signed callback, and removes retained incident content after 30 days.

## Current state

The greenfield MVP is implemented locally across the web app, worker, shared packages, schema migration, fixtures, and CI. All files are currently untracked because the repository began empty; preserve them when starting the next thread.

Implemented architecture:

- Node.js 24 and pnpm 10.26 through mise; engine range is `>=22 <25`.
- Next.js App Router web/API application.
- WorkOS AuthKit active-organization authentication with `admin` and `member` authorization.
- Turso/libSQL with Drizzle ORM and a custom durable leased-job queue.
- Read-only GitHub App integration and exact-SHA archive retrieval.
- Railway Sandbox SDK pinned to `3.6.0` behind `SandboxProvider`.
- OpenRouter tool loop and structured diagnosis behind the model boundary.
- Signed callbacks with DNS re-resolution, address pinning, SSRF rejection, and retries.
- Daily retention purge and 15-minute orphan-sandbox janitor.

Useful entry points:

- `README.md`: developer setup and Railway deployment.
- `packages/db/src/schema.ts`: all 15 tables.
- `packages/db/src/incidents.ts`: atomic incident, quota reservation, idempotency, retry runs.
- `packages/db/src/jobs.ts`: queue singleton, lease recovery, deferral, retries.
- `apps/web/app/api/v1/services/[serviceSlug]/incidents/route.ts`: public ingestion API.
- `apps/worker/src/analysis.ts`: complete analysis lifecycle.
- `packages/sandbox/src/provider.ts`: constrained Railway adapter.
- `packages/sandbox/src/probe.ts`: mandatory real capability probe.
- `packages/agent/src/openrouter.ts`: privacy-enforced model calls.
- `apps/worker/src/callbacks.ts`: callback construction and delivery.
- `apps/worker/src/maintenance.ts`: retention and orphan cleanup.

## Verified locally

The following passed after the final dependency update:

```sh
pnpm check
pnpm build
pnpm audit
pnpm --filter @legwork/db generate
```

Results at handoff:

- Lint and strict TypeScript passed in all 10 workspaces.
- 25 Vitest tests passed across 8 test files.
- The production build passed for all workspaces and Next.js routes.
- `pnpm audit` reported no known vulnerabilities.
- Drizzle reported no schema changes beyond the checked-in initial migration.

The execution environment did not expose mise shims directly on `PATH`, so commands were run as `mise exec -- pnpm ...`. The repository already has `mise.toml` and `.node-version`; do not add Corepack. A developer shell with mise activation can use `pnpm` directly.

## Not yet verified

These items require real staging credentials or external configuration and must not be marked complete based on mocks:

- WorkOS sign-in, organization creation, invitation, role update, and organization switching.
- GitHub App installation, repository webhooks, suspension/removal, token minting, and exact-SHA download.
- OpenRouter routing and the selected model's real tool/structured-output behavior.
- Callback delivery to a real public HTTPS endpoint, including all retry intervals.
- Railway Sandbox create/upload/execute/destroy lifecycle.
- The mandatory no-egress capability probe.
- Turso production migration, concurrency behavior, and restore/backup retention policy.
- Full authenticated Playwright scenarios.
- The live 20-case agent-quality evaluation. Fixtures exist, but the current test only validates fixture attribution and coverage.
- Real Slack and Discord webhook delivery. Destination parsing, rendering, routing, and the retry state machine are unit-tested, but no message has been posted to a live webhook.
- Resend email delivery. It stays unsendable until a sending domain is verified; `legwork.dev` is a placeholder, so `RESEND_FROM_ADDRESS` has no verified domain behind it yet.

## Safe continuation order

1. Read all files in `docs/` and `.env.example`.
2. Create staging resources and scope secrets according to `ARCHITECTURE.md`.
3. Run `pnpm db:migrate` against the staging Turso database.
4. Configure WorkOS roles and URLs, then test onboarding and cross-organization denial.
5. Configure the read-only GitHub App and run installation/webhook/exact-SHA tests.
6. Exercise OpenRouter with recorded fixtures and confirm privacy-route failure remains fail-closed.
7. Run `pnpm --filter @legwork/sandbox probe` against the real Railway project.
8. Leave command execution disabled unless every probe assertion passes.
9. Expand and execute the authenticated E2E suite and live agent evaluation.
10. Verify Turso backup aging before making any public backup-deletion promise.

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
