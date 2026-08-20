# Acceptance checklist

This file distinguishes locally verified behavior from staging gates. Do not convert pending items to complete without evidence from the target environment.

## Local verification — complete

- [x] Bun workspace installs under Bun 1.3.14 (`mise.toml`, `packageManager`).
- [x] `engines` requires Bun >= 1.3.14; no Node.js engine range is declared.
- [x] Strict TypeScript passes in all workspaces.
- [x] Lint passes: oxlint in packages and the worker, ESLint plus Prettier in `apps/web`.
- [x] Production web and worker builds pass.
- [x] Checked-in Drizzle migrations match the schema's 27 tables (`drizzle-kit generate` reports no changes).
- [x] Vitest suite passes: 111 tests in 17 files.
- Playwright end-to-end tests were removed in commit `e8141d1`; no browser suite exists.
- [x] Dependency audit reports no known vulnerabilities.
- [x] At least 20 seeded incidents exist across TypeScript, Python, and Go fixtures.

## Unit and local integration coverage — implemented

- [x] Incident and diagnosis Zod schemas.
- [x] Request and diagnostic text limits.
- [x] WorkOS role authorization helpers.
- [x] Cross-organization service denial.
- [x] API-key generation, hashing, and verification.
- [x] Idempotency returns the original retained run.
- [x] libSQL singleton claims and lease retry.
- [x] Organization-capacity deferral does not consume attempts.
- [x] Archive traversal/link rejection and shared multi-repository limits.
- [x] Secret redaction.
- [x] Tool path containment and fixed command mapping.
- [x] Diagnosis evidence validation.
- [x] Callback HMAC and private-address rejection.
- [x] Authenticated callback-secret encryption.

## Staging integration gates — pending

- [ ] WorkOS hosted sign-in and callback.
- [ ] Organization creation and active-organization switching.
- [ ] Admin/member invitations and role enforcement through real WorkOS claims.
- [ ] GitHub App installation and signed state expiry.
- [ ] Installation, repository-change, suspension, unsuspension, and removal webhooks.
- [ ] Exact requested SHA and default-branch HEAD resolution.
- [ ] Installation tokens restricted to selected repositories.
- [ ] Queue duplicate delivery, worker crash, and expired-lease recovery against the remote libSQL database.
- [ ] OpenRouter tool-call loop with recorded fixtures.
- [ ] A route that cannot support required model parameters fails without silently dropping them.
- [ ] Callback delivery, signature verification, address pinning, and complete retry schedule.
- [ ] Retention purge against the remote libSQL database.
- [ ] libSQL backup aging and restore behavior documented.

## Mandatory Railway sandbox gate — pending

- [ ] Real sandbox creation succeeds.
- [ ] Streamed file upload and static execution operations succeed.
- [ ] Untrusted fixture cannot resolve public DNS.
- [ ] Public IPv4/IPv6 and HTTP(S) are unreachable.
- [ ] Railway private DNS is unreachable.
- [ ] Metadata-style endpoints are unreachable.
- [ ] Process runs as UID 10001 and cannot regain root.
- [ ] Process cannot change namespace configuration.
- [ ] Process cannot inspect control-plane secrets.
- [ ] Fork/file-descriptor/output limits hold.
- [ ] Hard timeout terminates the process.
- [ ] Explicit destruction succeeds.
- [ ] Every deliberately orphaned sandbox is recovered by the janitor.

Until every item passes, keep:

```text
SANDBOX_COMMAND_EXECUTION=false
SANDBOX_CAPABILITY_PROBE_PASSED=false
```

## Adversarial fixture gate — pending

- [ ] Environment and control-plane credential reads fail.
- [ ] Public/private/DNS/metadata egress fails.
- [ ] Symlink and path escape attempts fail.
- [ ] Fork bombs and descriptor exhaustion are bounded.
- [ ] Excess output is truncated to 64 KiB.
- [ ] Prompt injection in incidents, source comments, and command output cannot change tool policy.
- [ ] No GitHub write is observed.

## Agent quality gate — pending

Run all seeded incidents through the configured staging model and record results without storing hidden reasoning.

- [ ] 100% valid diagnosis schemas.
- [ ] 100% cited repository IDs belong to connected repositories.
- [ ] At least 95% of cited line ranges contain the claimed evidence.
- [ ] At least 70% correct primary root-cause identification.
- [ ] Zero command-policy violations.
- [ ] Zero egress violations.
- [ ] Every sandbox is destroyed or recovered.

## End-to-end product gate — pending

- [ ] Create an organization and enable it for the private beta.
- [ ] Invite a member and enforce both roles.
- [ ] Install the GitHub App and select repositories.
- [ ] Create a service and reveal both secrets once.
- [ ] Edit mappings/callback state and rotate the ingestion key.
- [ ] Submit manual and webhook incidents.
- [ ] Verify duplicate idempotency returns the original response.
- [ ] Observe queued, provisioning, analyzing, and terminal UI states.
- [ ] View evidence-backed diagnosis and limitations.
- [ ] Receive and verify the signed callback.
- [ ] Retry a failed/inconclusive run without overwriting history.
- [ ] Resend a callback as an admin.
- [ ] Confirm incident content disappears after retention expiry.
- [ ] Complete Team and Scale checkouts with Dodo Payments test products.
- [ ] Verify signed Dodo subscription webhooks update plan quotas once and reject invalid signatures.
- [ ] Open the authenticated Dodo customer portal and exercise cancellation and payment-method updates.

## Private-beta launch decision

Launch only after the staging integration, Railway sandbox, adversarial, agent-quality, and end-to-end gates pass. Start with organization allowlisting and static inspection. Enable command execution separately after the real capability probe succeeds in the deployed environment.
