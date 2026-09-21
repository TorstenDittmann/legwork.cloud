FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    python3 \
    golang-go \
    rustc \
    cargo \
    ripgrep \
    git \
    jq \
    tar \
    util-linux \
    procps \
  && rm -rf /var/lib/apt/lists/*

RUN set -eu \
  && arch="$(uname -m)" \
  && case "$arch" in \
       x86_64) bun_arch="x64" ;; \
       aarch64|arm64) bun_arch="aarch64" ;; \
       *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
     esac \
  && curl --fail --silent --show-error --location \
       "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-linux-$bun_arch.zip" \
       --output /tmp/bun.zip \
  && unzip -q /tmp/bun.zip -d /tmp/bun-release \
  && install -m 0755 "/tmp/bun-release/bun-linux-$bun_arch/bun" /usr/local/bin/bun \
  && rm -rf /tmp/bun.zip /tmp/bun-release \
  && bun --version

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin analyst \
  && mkdir -p /workspace \
  && chown -R analyst:analyst /workspace

COPY scripts/ocai-bootstrap-repositories.py /usr/local/bin/ocai-bootstrap-repositories
COPY scripts/ocai-run-check.sh /usr/local/bin/ocai-run-check
RUN chmod 0755 /usr/local/bin/ocai-bootstrap-repositories /usr/local/bin/ocai-run-check

WORKDIR /workspace
CMD ["sleep", "infinity"]
