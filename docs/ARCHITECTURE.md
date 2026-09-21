# Architecture and security model

## Components

### Web control plane

`apps/web` owns public ingestion, WorkOS-authenticated product pages, GitHub setup/webhooks, service configuration, manual incidents, and retries. Callback resends are planned but not yet implemented. It does not run repository code or mint GitHub installation tokens.

### Worker

`apps/worker` claims durable libSQL jobs, resolves GitHub revisions, streams source, provisions sandboxes, runs the agent, persists diagnoses/usage, delivers callbacks, purges expired content, and destroys orphaned sandboxes.

### libSQL

The libSQL database stores tenant configuration, incidents, run state, structured evidence, usage, audit events, callback state, and durable jobs. It never stores GitHub archives or sandbox working copies.

### External providers

- WorkOS: user sessions, organizations, memberships, invitations, and roles.
- GitHub App: read-only metadata, contents, Actions, Deployments, and installation events.
- microsandbox: disposable local microVM analysis sandboxes (optional Docker fallback).
- OpenRouter: model tool selection and structured diagnosis.
- LangGraph: full incident lifecycle state machine with libSQL checkpoints.

## Provider boundaries

Vendor behavior is contained behind these conceptual interfaces:

```ts
interface SandboxProvider {
	create(run: RunContext): Promise<SandboxHandle>;
	prepareRepositories(
		handle: SandboxHandle,
		manifest: SandboxRepositoryManifest,
		incident: Uint8Array,
		onProgress?: (progress: RepositoryPreparationProgress) => void,
	): Promise<void>;
	inspect(handle: SandboxHandle, operation: InspectionOperation): Promise<ToolResult>;
	runCheck(handle: SandboxHandle, check: CheckRequest): Promise<ToolResult>;
	destroy(handle: SandboxHandle): Promise<void>;
}

interface ModelProvider {
	continueAgent(input: AgentTurn): Promise<AgentTurnResult>;
	createDiagnosis(input: FinalDiagnosisInput): Promise<Diagnosis>;
}

interface SourceProvider {
	resolveRevision(repositoryId: string, requestedSha?: string): Promise<string>;
	streamArchive(repositoryId: string, sha: string): Promise<ReadableStream>;
}
```

The implemented method signatures vary slightly, but these ownership boundaries remain authoritative.

## Analysis sequence

```text
Caller
  -> service API key authentication
  -> validation, rate limit, redaction, quota reservation
  -> incident + run + durable job in one libSQL transaction
  -> worker lease
  -> exact GitHub SHAs and restricted installation token
  -> exact-SHA temporary GitHub archive capabilities
  -> disposable analysis sandbox (microsandbox microVM)
  -> controlled archive download and validation bootstrap
  -> bounded static inspection / optional fixed offline check
  -> OpenRouter structured diagnosis
  -> evidence validation and persistence
  -> sandbox destruction in finally
  -> signed callback job
  -> retention purge after 30 days
```

## Tenancy

Every customer-owned application table carries `organization_id`. WorkOS supplies the active external organization, which is mapped to the internal organization row before queries run. Service credentials resolve their organization through the stored hashed key and service relationship.

Browser-provided organization IDs are never accepted as authority. IDs for services, repositories, incidents, runs, memberships, and callbacks are always combined with the derived organization in reads and mutations.

## Durable jobs on libSQL

The `durable_jobs` table replaces `pg-boss` because the database was changed from PostgreSQL to libSQL.

Queue guarantees:

- Active singleton uniqueness for `(name, singleton_key)`.
- Immediate transactions around claims.
- Lease owner and expiry for worker-crash recovery.
- Attempt accounting and bounded retry.
- Scheduled availability for callback backoff.
- Capacity deferral without consuming an infrastructure attempt.
- Run IDs and delivery IDs act as singleton keys for primary jobs.

## Source ingestion

The worker stores GitHub installation and repository numeric IDs, never installation tokens. Tokens are minted only to resolve source and obtain exact-SHA temporary archive redirects. Tokens and the GitHub App private key are never forwarded into the sandbox.

The sandbox receives only temporary `codeload.github.com` archive capabilities in a short-lived manifest. Its privileged bootstrap downloads and validates those archives using the sandbox's allowlisted egress, deletes the manifest and compressed archives, and then hands the extracted repositories to the unprivileged analyst user. Temporary URLs are never logged or placed in an exec command.

Archive policy applies one shared budget across all repositories in a run:

- 100,000 files.
- 250 MiB compressed.
- 1 GiB extracted.
- 64 MiB maximum individual file.
- No traversal paths.
- No hard links or symbolic links.
- Unsupported archive entry types are rejected.
- Extraction happens inside the sandbox before the run enters `analyzing`.

## Agent tool boundary

The model can request only:

```text
list_tree(repositoryId, path, depth)
search_code(repositoryId, query, glob?)
read_file(repositoryId, path, start, end)
run_check(repositoryId, test|build|lint|typecheck)
```

Model-controlled strings are schema-validated, path-contained, shell-quoted where necessary, and output-bounded. The model never receives host credentials or a generic command string.

## Sandbox execution gate

Repository bootstrap is the only phase allowed to use sandbox egress, and only to `codeload.github.com` via the microsandbox network policy. Agent inspection and approved repository commands run through `ocai-run-check`, which creates a no-egress network namespace. The capability probe verifies DNS, public HTTP, private-network, and metadata access remain unavailable inside that command boundary.

Static inspection is always available after a sandbox is created. Repository execution requires both:

```text
SANDBOX_COMMAND_EXECUTION=true
SANDBOX_CAPABILITY_PROBE_PASSED=true
```

`run_check` maps manifests to fixed offline commands and invokes a non-root wrapper using a fresh network namespace, `no_new_privs`, empty environment, process/file/address-space limits, and a hard timeout. Missing dependencies produce an unavailable limitation; they never trigger an install.

The real probe must prove file/exec operations, no DNS/public/private/metadata reachability, non-root execution, no namespace recovery, no control-plane secret visibility, timeout termination, and destruction. Any failure keeps execution disabled.

## Model privacy and evidence

OpenRouter requests require parameter support and permit provider fallbacks. Provider data-collection filters and per-request ZDR enforcement are intentionally disabled for the MVP. Routing failures raise `MODEL_PRIVACY_ROUTE_UNAVAILABLE` rather than silently dropping required model parameters.

The durable queue remains the outer scheduler. Each analysis run is a LangGraph thread keyed by its run ID, with checkpoints and pending writes stored tenant-scoped in libSQL for the same 30-day retention period. Queue retries resume the latest checkpoint instead of repeating completed model and tool stages. LangSmith tracing is disabled and no checkpoint or trace data leaves the application database.

The application sends incident context and only tool-requested excerpts/output. It does not send whole repositories or persist complete conversations or hidden reasoning.

Final diagnoses are strict structured data. Cited repository IDs, paths, line spans, and excerpts are checked against the uploaded snapshot. One repair request is allowed; a second validation failure becomes an inconclusive result.

## Callback security

- Only an admin-configured credential-free HTTPS URL on port 443 is accepted.
- DNS is resolved for every delivery.
- Loopback, private, link-local, reserved, and non-unicast answers are rejected.
- The approved address is pinned into the HTTP dispatcher to reduce DNS rebinding risk.
- The signature is `v1=HMAC_SHA256(secret, timestamp + "." + rawBody)`.
- The body omits logs, source excerpts, and patch suggestions.
- Retry delays are 1 minute, 5 minutes, 30 minutes, 2 hours, and 24 hours.

## Outbound notifications

Slack, Discord, and email channels are configured per organization and routed to services through
`notification_channel_services`; a channel with no rows there matches every service. Destinations
are stored encrypted, because a Slack or Discord webhook URL is an unscoped bearer credential.

Notification bodies carry the summary, root-cause statement with confidence, and cited file paths
with line ranges. They never carry evidence excerpts, suggested fixes, or patches: the payload type
has no excerpt field, and a test asserts no excerpt renders into any channel body. Anything richer
stays behind the dashboard link.

Webhook hosts are allowlisted exactly — `hooks.slack.com/services/…` and
`discord.com`/`discordapp.com` `/api/webhooks/…` — which is stricter than the callback path, where
any public host must be permitted. Email recipients are validated as addresses and always sent
through the fixed Resend endpoint. Address pinning still applies underneath as defense in depth.

Delivery retries at 30 seconds, 2 minutes, and 10 minutes, then stops. A 429 honors `Retry-After`
clamped to 15 minutes; any other 4xx fails permanently on the first attempt, because a deleted
webhook stays deleted. Each channel has its own delivery row and job, so one broken destination
cannot affect another channel or the HTTP callback.

## Retention

Incident payloads, runs, agent steps, diagnoses, and callback and notification deliveries expire
after 30 days. Daily purge metrics record deletions. Source exists only in the active sandbox. Aggregate usage events contain no prompt, source, logs, or diagnosis content.

No public claim about backup deletion timing is permitted until the libSQL deployment's actual production backup/restore policy is tested and documented.

## Secret allocation

Shared where needed:

- libSQL URL/token.
- Application URL.

Web only or primarily web-facing:

- WorkOS client ID/API key/cookie secret/redirect URI.
- GitHub webhook and installation-state secrets.
- Data encryption key, because service creation encrypts callback secrets.

Worker only:

- GitHub App ID/private key.
- OpenRouter API key.
- Microsandbox runtime on the worker host (Linux+KVM, Apple Silicon, or Windows WHP). Optional Docker when `SANDBOX_PROVIDER=docker`.
- Resend API key and sending address, because the worker sends notification email. The web app only
  enqueues test deliveries, so no mail credential reaches the internet-facing service.
- Data encryption key, because callback delivery decrypts signing secrets.

Never inject these secrets into a sandbox template or sandbox environment.
