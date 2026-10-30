#!/bin/sh
set -eu
repo="$1"
shift
case "$repo" in /workspace/repositories/*) ;; *) exit 125;; esac
exec unshare --net --mount --pid --fork --kill-child --mount-proc \
  setpriv --reuid=10001 --regid=10001 --clear-groups --no-new-privs \
  prlimit --nproc=128 --nofile=256 --fsize=67108864 --as=2147483648 \
  env -i HOME=/home/analyst PATH=/usr/local/bin:/usr/bin:/bin CI=true "$@"
