#!/bin/sh
set -eu
bun run db:migrate
cd /app/apps/web
exec bun --bun ./build/index.js
