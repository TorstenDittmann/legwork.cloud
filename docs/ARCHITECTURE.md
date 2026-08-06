# Architecture and security model

## Components

### Web control plane

`apps/web` owns public ingestion, WorkOS-authenticated product pages, GitHub setup/webhooks, service configuration, manual incidents, retries, and callback resends. It does not run repository code or mint GitHub installation tokens.

### Worker

`apps/worker` claims durable Turso jobs, resolves GitHub revisions, streams source, provisions sandboxes, runs the agent, persists diagnoses/usage, delivers callbacks, purges expired content, and destroys orphaned sandboxes.

### Turso

Turso stores tenant configuration, incidents, run state, structured evidence, usage, audit events, callback state, and durable jobs. It never stores GitHub archives or sandbox working copies.

### External providers

- WorkOS: user sessions, organizations, memberships, invitations, and roles.
- GitHub App: read-only metadata/contents and installation events.
- Railway: disposable analysis sandboxes.
- OpenRouter: model tool selection and structured diagnosis.

## Provider boundaries

Vendor behavior is contained behind these conceptual interfaces:

```ts
interface SandboxProvider {
  create(run: RunContext): Promise<SandboxHandle>;
  upload(handle: SandboxHandle, files: AsyncIterable<SourceFile>): Promise<void>;
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
  -> incident + run + durable job in one Turso transaction
  -> worker lease
  -> exact GitHub SHAs and restricted installation token
  -> validated archive stream
  -> disposable Railway Sandbox
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

## Durable jobs on Turso

The `durable_jobs` table replaces `pg-boss` because the database was changed from PostgreSQL to Turso.

Queue guarantees:

- Active singleton uniqueness for `(name, singleton_key)`.
- Immediate transactions around claims.
- Lease owner and expiry for worker-crash recovery.
- Attempt accounting and bounded retry.
- Scheduled availability for callback backoff.
- Capacity deferral without consuming an infrastructure attempt.
- Run IDs and delivery IDs act as singleton keys for primary jobs.

## Source ingestion

The worker stores GitHub installation and repository numeric IDs, never installation tokens. Tokens are minted only when resolving source and are not forwarded into the sandbox.

Archive policy applies one shared budget across all repositories in a run:

- 100,000 files.
- 250 MiB compressed.
- 1 GiB extracted.
- 64 MiB maximum individual file.
- No traversal paths.
- No hard links or symbolic links.
- Unsupported archive entry types are rejected.
- Extraction applies one-file backpressure while uploading.

## Agent tool boundary

The model can request only:

```text
list_tree(repositoryId, path, depth)
search_code(repositoryId, query, glob?)
read_file(repositoryId, path, start, end)
run_check(repositoryId, test|build|lint|typecheck)
```

Model-controlled strings are schema-validated, path-contained, shell-quoted where necessary, and output-bounded. The model never receives Railway credentials or a generic command string.

## Sandbox execution gate

Static inspection is always available after a sandbox is created. Repository execution requires both:

```text
SANDBOX_COMMAND_EXECUTION=true
SANDBOX_CAPABILITY_PROBE_PASSED=true
```

`run_check` maps manifests to fixed offline commands and invokes a non-root wrapper using a fresh network namespace, `no_new_privs`, empty environment, process/file/address-space limits, and a hard timeout. Missing dependencies produce an unavailable limitation; they never trigger an install.

The real probe must prove file/exec operations, no DNS/public/private/metadata reachability, non-root execution, no namespace recovery, no control-plane secret visibility, timeout termination, and destruction. Any failure keeps execution disabled.

## Model privacy and evidence

OpenRouter requests require parameter support, ZDR routing, and data-collection denial. Routing failures must raise `MODEL_PRIVACY_ROUTE_UNAVAILABLE`; no fallback may weaken privacy.

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

## Retention

Incident payloads, runs, agent steps, diagnoses, and callback deliveries expire after 30 days. Daily purge metrics record deletions. Source exists only in the active sandbox. Aggregate usage events contain no prompt, source, logs, or diagnosis content.

No public claim about backup deletion timing is permitted until Turso's actual production backup/restore policy is tested and documented.

## Secret allocation

Shared where needed:

- Turso URL/token.
- Application URL.

Web only or primarily web-facing:

- WorkOS client ID/API key/cookie secret/redirect URI.
- GitHub webhook and installation-state secrets.
- Data encryption key, because service creation encrypts callback secrets.

Worker only:

- GitHub App ID/private key.
- OpenRouter API key.
- Railway API token and sandbox template configuration.
- Data encryption key, because callback delivery decrypts signing secrets.

Never inject these secrets into a sandbox template or sandbox environment.
