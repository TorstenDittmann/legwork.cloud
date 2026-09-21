import { Sandbox } from "railway";
import { loadSandboxScript } from "./shared";

// The template contains tools only. No runtime or control-plane credential is baked in.
export function analysisTemplate() {
	const bootstrap = loadSandboxScript("ocai-bootstrap-repositories.py");
	const runCheck = loadSandboxScript("ocai-run-check.sh");
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
${bootstrap}PYTHON
chmod 0755 /usr/local/bin/ocai-bootstrap-repositories`)
		.run(`cat >/usr/local/bin/ocai-run-check <<'SCRIPT'
${runCheck}SCRIPT
chmod 0755 /usr/local/bin/ocai-run-check`)
		.workdir("/workspace");
}

export async function buildAnalysisTemplate(): Promise<void> {
	await analysisTemplate().build();
}
