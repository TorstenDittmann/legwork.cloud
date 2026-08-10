# Connection Discovery Wizard

Date: 2026-08-10
Status: approved (approach approved in conversation; Datadog deferred to a follow-up)

## Problem

Adding a Grafana or Sentry connection on `/connections` requires a flat ten-field form.
Admins must manually look up Grafana data-source UIDs and Sentry organization/project
slugs in the other product before they can fill it in, must pick a provider "mode"
themselves, and only learn about typos after saving and clicking "Test".

## Goal

Reduce connection setup to: pick provider, paste base URL and token, then choose from
options the server discovered by calling the provider's own API. Verification happens
automatically at save time. Self-hosted and cloud deployments use the same flow.

Out of scope: Datadog support (follow-up), OAuth install flows, changes to per-service
alert webhook integrations.

## Design

### Discovery module (`packages/integrations/src/discovery.ts`)

New exported functions, reusing the existing SSRF-pinned `boundedJson` fetch (exported
from `providers.ts`):

- `inferProviderMode(provider, baseUrl)` — pure. Hosts equal to or under `grafana.net`
  → `grafana_cloud`; equal to or under `sentry.io` → `sentry_cloud`; otherwise the
  `_http` variant.
- `normalizeGrafanaDatasources(raw)` — pure. Accepts the `GET /api/datasources`
  response, returns up to 200 `{ uid, type, name }` entries whose type is
  `loki` | `prometheus` | `tempo`, with bounded string lengths.
- `normalizeSentryProjects(raw)` — pure. Accepts the `GET /api/0/projects/` response,
  returns up to 200 `{ organizationSlug, projectSlug, name }` entries, bounded.
- `discoverGrafanaDatasources(baseUrl, token, signal?)` and
  `discoverSentryProjects(baseUrl, token, signal?)` — fetch + normalize. Errors surface
  as existing `IntegrationProviderError` codes.

The pure normalizers and `inferProviderMode` are unit-tested in
`discovery.test.ts`; the fetch wrappers stay thin and untested (network).

### Server actions (`apps/web/app/(dashboard)/connections/actions.ts`)

- `discoverConnection(prevState, formData)` — admin-only. Validates
  `{ provider, baseUrl, token }`, runs the SSRF check, calls the matching discovery
  function, returns `{ status: "ok", ... }` with datasources/projects or
  `{ status: "error", code }`. Never persists or returns the token.
- `createConnection(prevState, formData)` — reshaped for `useActionState`. Mode is no
  longer a form field; it is computed with `inferProviderMode`. After inserting, the
  connection is verified immediately (same logic as `testConnection`, extracted into a
  shared helper) and `lastVerifiedAt` / `lastVerificationError` are set. Returns
  `{ ok, errorCode? }` instead of throwing on validation failure.
- `testConnection` / `toggleConnection` unchanged in behavior.

### Wizard UI (`apps/web/app/(dashboard)/connections/add-connection-form.tsx`)

New client component replacing the flat form on `page.tsx`:

1. Step 1: provider, name, HTTPS base URL, API token. "Discover" submits via
   `useActionState(discoverConnection)`.
2. Step 2 (after discovery succeeds):
   - Grafana: three selects (logs / metrics / traces) listing discovered data sources
     of the matching type, each with a "None" option; first match pre-selected.
   - Sentry: one select of discovered `organization/project` pairs, which populates
     `organizationSlug` / `projectSlug`.
3. "Save connection" submits via `useActionState(createConnection)`; success resets the
   wizard, failure shows the error code.

Inputs are controlled so values survive the discover round-trip (React 19 resets
uncontrolled fields after form actions). If discovery fails, the error is shown and a
"enter details manually" toggle reveals the previous raw fields (slugs / UIDs) as an
escape hatch, submitting through the same `createConnection` action.

The token is held only in client state and in the two action invocations; it is never
echoed back or persisted outside the existing encrypted credential path.

### Error handling

Discovery and creation reuse `IntegrationProviderError` codes
(`PROVIDER_URL_UNSAFE`, `PROVIDER_AUTHENTICATION_FAILED`, `PROVIDER_PERMISSION_DENIED`,
`PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`), rendered
as human-readable text in the wizard.

### Testing

- `packages/integrations/src/discovery.test.ts`: mode inference (cloud vs self-hosted
  hosts, lookalike hosts such as `evilgrafana.net` must not match), datasource
  filtering and bounding, Sentry project mapping and bounding, malformed payloads.
- Existing `bun run check` (oxlint, tsc, vitest) must pass.
