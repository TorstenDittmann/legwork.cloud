import { Sandbox } from "railway";

// The template contains tools only. No runtime or control-plane credential is baked in.
export function analysisTemplate() {
	return Sandbox.template()
		.withPackages(
			"bun",
			"python3",
			"go",
			"rustc",
			"cargo",
			"ripgrep",
			"git",
			"jq",
			"gnutar",
			"util-linux",
			"procps",
		)
		.run(
			"useradd --create-home --uid 10001 --shell /usr/sbin/nologin analyst && mkdir -p /workspace && chown -R analyst:analyst /workspace",
		)
		.run(`cat >/usr/local/bin/ocai-run-check <<'SCRIPT'
#!/bin/sh
set -eu
repo="$1"
shift
case "$repo" in /workspace/repositories/*) ;; *) exit 125;; esac
exec unshare --net --mount --pid --fork --mount-proc \
  setpriv --reuid=10001 --regid=10001 --clear-groups --no-new-privs \
  prlimit --nproc=128 --nofile=256 --fsize=67108864 --as=2147483648 \
  env -i HOME=/home/analyst PATH=/usr/local/bin:/usr/bin:/bin CI=true "$@"
SCRIPT
chmod 0755 /usr/local/bin/ocai-run-check`)
		.workdir("/workspace");
}
