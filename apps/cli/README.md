# Legwork CLI

The Legwork CLI is a reactive incident trigger. It leaves successful commands alone and reports a
wrapped command only when that command fails.

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
