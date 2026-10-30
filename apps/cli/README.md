# Legwork CLI

The Legwork CLI is a reactive incident trigger. It leaves successful commands alone and reports a
wrapped command only when that command fails.

## Install

The CLI runs on Bun 1.4 or newer. Run it without installing:

```sh
bunx @legwork/cli configure --service payments-api
```

Or install it globally with `bun add -g @legwork/cli`.

## Install from this repository

Use the repository-pinned Bun 1.4.0 runtime, then build and link the executable:

```sh
bun install
bun run --filter @legwork/cli build
cd apps/cli
bun link
legwork --version
```

`bun link` puts the `legwork` executable in Bun's global bin directory. Run `bun unlink` from
`apps/cli` to remove it.

## Configure once

Copy the service slug and one-time ingestion key from the Legwork service screen. The key prompt is
hidden, and the verified config is stored with owner-only file permissions.

```sh
legwork configure --service payments-api
legwork doctor
```

For CI or another non-interactive environment, pass the key through stdin:

```sh
printf '%s' "$LEGWORK_API_KEY" | legwork configure \
  --service payments-api \
  --api-key-stdin
```

Use `--url http://localhost:5173` for local development. Remote API origins must use HTTPS.

## React to command failures

Place `legwork run` before any command. Stdout and stderr continue to stream to the terminal. On a
non-zero exit, Legwork queues an investigation and prints its dashboard URL; on success, it makes no
API request. The wrapped command's exit code is always preserved.

```sh
legwork run --environment production -- bun test
legwork run --severity critical -- ./scripts/deploy.sh
```

The incident includes the executable name, exit code, selected CI metadata, and at most 128 KiB from
the tail of stdout and stderr. It does not include the working directory, command arguments, or the
rest of the process environment. Because command output itself can contain sensitive data, avoid
printing secrets even though the ingestion pipeline also applies server-side redaction.

## Submit a signal directly

Use `incident` for scripts, deploy hooks, or piped diagnostics:

```sh
deploy-command 2>&1 | legwork incident \
  --stdin \
  --title "Production deployment failed" \
  --severity high \
  --environment production \
  --external-id "deploy-42" \
  --context region=iad
```

A complete payload matching the versioned incident contract can be sent with `--payload incident.json`.
Use `--json` with `configure`, `doctor`, or `incident` for machine-readable output.

## Wait for the diagnosis

Add `--wait` to get the diagnosis back in the same process. This is the simplest way to hand a
Legwork diagnosis to a coding agent or to a CI log:

```sh
# After a failure, print the diagnosis to stderr. The exit code is still the command's.
legwork run --wait -- bun test

# Report, wait, and get the full result as JSON.
deploy-command 2>&1 | legwork incident --stdin --title "Deploy failed" --wait --json

# Check or wait on an incident you already reported.
legwork status <incident-id> --wait --json
```

`--timeout <seconds>` caps the wait (default 600). `status --wait` and `incident --wait` exit `0` for
a completed or inconclusive diagnosis and `1` for a failed, cancelled, or timed-out analysis. The
JSON is the `incidentResultResponseSchema` contract from `@legwork/contracts`, served by
`GET /api/v1/services/<service>/incidents/<incident-id>` with the same ingestion key. A key can only
read incidents from its own service.

## GitHub Actions

The `actions/run` action in this repository wraps a CI step:

```yaml
- uses: TorstenDittmann/legwork.cloud/actions/run@main
  with:
    command: bun test
    service: payments-api
    api-key: ${{ secrets.LEGWORK_API_KEY }}
    environment: ci
    wait: true # print the diagnosis in the log and the job summary
```

The step fails exactly when the command fails. See `actions/run/action.yml` for every input.

## CI without a config file

Flags take precedence over environment variables, which take precedence over the saved config:

```sh
export LEGWORK_API_URL=https://legwork.dev
export LEGWORK_SERVICE=payments-api
export LEGWORK_API_KEY=ocai_live_...

legwork run -- bun test
```

The saved config defaults to `$XDG_CONFIG_HOME/legwork/config.json` or
`$HOME/.config/legwork/config.json`. Set `LEGWORK_CONFIG` to use a different file.

## Commands and exit codes

Run `legwork help <command>` for every option.

- `configure` verifies credentials before saving unless `--no-verify` is set.
- `doctor` checks the API origin, service slug, and ingestion key.
- `incident` returns `0` after the incident is queued, `1` for connection/API failures, and `2` for
  invalid usage.
- `run` returns the wrapped command's exit code, including when incident reporting itself fails.
- `status` returns `0` after printing the current state; with `--wait`, it follows the rule above.

## Releasing

Bump `version` in `apps/cli/package.json`, then push a matching `cli-v<version>` tag. The
`Release CLI` workflow tests, packs, and publishes to npm with provenance. It needs an `NPM_TOKEN`
secret with publish rights to the `@legwork` scope.
