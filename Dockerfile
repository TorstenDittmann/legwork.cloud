# syntax=docker/dockerfile:1

FROM oven/bun:1.4.0 AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tsconfig.base.json vitest.config.ts mise.toml ./
RUN bun install --frozen-lockfile

FROM base AS web-build
RUN bun run --filter @legwork/web build

FROM oven/bun:1.4.0 AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=base /app /app
COPY --from=web-build /app/apps/web/build /app/apps/web/build
COPY docker/web-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

FROM oven/bun:1.4.0 AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app /app
CMD ["bun", "apps/worker/src/index.ts"]
