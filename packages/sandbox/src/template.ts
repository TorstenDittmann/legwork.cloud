import { readFileSync } from "node:fs";
import { Sandbox } from "railway";

/** Directory holding the sandbox scripts and the Docker provider's image definition. */
export const SANDBOX_IMAGE_DIRECTORY = new URL("../image/", import.meta.url);

function sandboxScript(name: string): string {
	return readFileSync(new URL(name, SANDBOX_IMAGE_DIRECTORY), "utf8");
}

// The Railway template mirrors image/Dockerfile. It contains tools only: no runtime or
// control-plane credential is baked in.
export function analysisTemplate() {
	return Sandbox.template()
		.withPackages(
			"ca-certificates",
			"curl",
			"unzip",
			"python3",
			"golang-go",
			"rustc",
			"cargo",
			"ripgrep",
			"git",
			"jq",
			"tar",
			"util-linux",
			"procps",
		)
		.run(`set -eu
arch="$(uname -m)"
case "$arch" in
  x86_64) bun_arch="x64" ;;
  aarch64|arm64) bun_arch="aarch64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac
curl --fail --silent --show-error --location \
  "https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-linux-$bun_arch.zip" \
  --output /tmp/bun.zip
unzip -q /tmp/bun.zip -d /tmp/bun-release
install -m 0755 "/tmp/bun-release/bun-linux-$bun_arch/bun" /usr/local/bin/bun
rm -rf /tmp/bun.zip /tmp/bun-release
bun --version`)
		.run(
			"useradd --create-home --uid 10001 --shell /usr/sbin/nologin analyst && mkdir -p /workspace && chown -R analyst:analyst /workspace",
		)
		.run(`cat >/usr/local/bin/ocai-bootstrap-repositories <<'PYTHON'
${sandboxScript("ocai-bootstrap-repositories.py")}PYTHON
chmod 0755 /usr/local/bin/ocai-bootstrap-repositories`)
		.run(`cat >/usr/local/bin/ocai-run-check <<'SCRIPT'
${sandboxScript("ocai-run-check.sh")}SCRIPT
chmod 0755 /usr/local/bin/ocai-run-check`)
		.workdir("/workspace");
}

export async function buildAnalysisTemplate(): Promise<void> {
	await analysisTemplate().build();
}
