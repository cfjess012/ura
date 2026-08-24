# Build from the repo ROOT. Env-driven config only — there is no local-vs-cloud
# branch anywhere in this image (SPEC §6.4 obligation 2).

FROM node:22-slim AS build
WORKDIR /app
# corepack needs the packageManager field in package.json to pick the pnpm the
# lockfile was written by; without it the build silently uses another major.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next's standalone server binds to this host. Left at the default it listens
# on localhost, the load balancer's health check never connects, and the
# platform reports a crash loop instead of "nothing is listening on 0.0.0.0".
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as a non-root user. The node image ships one.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Migrations ship with the image so the same artifact that serves traffic can
# apply them — no second build, and no chance of schema and code disagreeing.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src/data ./src/data

USER node
EXPOSE 3000
# /healthz answers without touching Postgres; /readyz says whether the
# database is reachable. The load balancer wants the first one.
CMD ["node", "server.js"]
