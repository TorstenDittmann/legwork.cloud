# Analysis sandbox image for the Docker provider. It contains tools only: no runtime or
# control-plane credential is baked in. Keep the package list in sync with src/template.ts.
FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251

ARG BUN_VERSION=1.4.0

RUN apt-get update \
	&& apt-get install --yes --no-install-recommends \
		ca-certificates curl unzip python3 golang-go rustc cargo ripgrep git jq tar util-linux procps \
	&& rm -rf /var/lib/apt/lists/*

RUN set -eu; \
	case "$(uname -m)" in \
		x86_64) bun_arch="x64" ;; \
		aarch64|arm64) bun_arch="aarch64" ;; \
		*) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;; \
	esac; \
	curl --fail --silent --show-error --location \
		"https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${bun_arch}.zip" \
		--output /tmp/bun.zip; \
	unzip -q /tmp/bun.zip -d /tmp/bun-release; \
	install -m 0755 "/tmp/bun-release/bun-linux-${bun_arch}/bun" /usr/local/bin/bun; \
	rm -rf /tmp/bun.zip /tmp/bun-release; \
	bun --version

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin analyst \
	&& mkdir -p /workspace \
	&& chown -R analyst:analyst /workspace

COPY --chmod=0755 ocai-bootstrap-repositories.py /usr/local/bin/ocai-bootstrap-repositories
COPY --chmod=0755 ocai-run-check.sh /usr/local/bin/ocai-run-check

WORKDIR /workspace

# The sandbox exits (and --rm removes it) after its maximum lifetime even if every
# destroy path fails; the janitor is the second line of recovery.
CMD ["sleep", "1800"]
