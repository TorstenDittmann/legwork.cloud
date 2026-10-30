# One image for every Legwork service on orch: orch.pkl picks the command per service.
FROM oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile \
	&& bun run --filter @legwork/web build \
	&& bun run --filter @legwork/worker build

FROM oven/bun:1.4.0-slim@sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=bun:bun /app /app
USER bun
EXPOSE 3000
