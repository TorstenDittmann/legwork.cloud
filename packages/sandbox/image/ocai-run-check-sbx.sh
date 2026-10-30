#!/bin/sh
# Check wrapper for the sbx provider. The sbx sandbox itself has no network interface, no
# Linux capabilities and a non-root user, so there is no namespace to enter or user to drop
# to here; the capability probe proves that boundary before run_check can be enabled.
set -eu
repo="$1"
shift
case "$repo" in /workspace/repositories/*) ;; *) exit 125;; esac
mkdir -p /workspace/.home
exec prlimit --nproc=128 --nofile=256 --fsize=67108864 --as=2147483648 \
  env -i HOME=/workspace/.home PATH=/usr/local/bin:/usr/bin:/bin CI=true "$@"
