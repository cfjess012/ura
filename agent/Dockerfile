# The agent service. Built from the REPO ROOT, because it shares the wire
# contract with the web app and there must be exactly one copy of it:
#   docker build -f agent/Dockerfile -t ura-agent .
FROM node:22-slim AS build
WORKDIR /app
COPY agent/package.json agent/pnpm-lock.yaml* ./agent/
RUN corepack enable && cd agent && pnpm install --prod --frozen-lockfile

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY --from=build --chown=node:node /app/agent/node_modules ./agent/node_modules
COPY --chown=node:node agent/package.json ./agent/
COPY --chown=node:node agent/src ./agent/src
COPY --chown=node:node agent/prompts ./agent/prompts
# The wire contract and the one verbatim matcher, shared with the web app.
# Copied rather than duplicated: a second matcher would let a quote pass the
# gate here and fail to highlight there.
COPY --chown=node:node src/lib/agent-contract.ts ./src/lib/agent-contract.ts
USER node
EXPOSE 8787
# /healthz answers without touching a model — the same separation the web
# service needed, for the same reason.
CMD ["node", "--experimental-strip-types", "agent/src/server.ts"]
