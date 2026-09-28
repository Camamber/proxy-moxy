# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.6.0

# --- base: node + pnpm + workspace manifests ------------------------------------
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /app
# Manifests first, so dependency layers stay cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

# --- build: the frontend bundle -------------------------------------------------
FROM base AS build
RUN pnpm install --frozen-lockfile --filter "@proxy-moxy/frontend..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
RUN pnpm --filter @proxy-moxy/frontend build

# --- prod-deps: backend runtime dependencies only -------------------------------
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@proxy-moxy/backend..."

# --- runtime --------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    API_PORT=4000 \
    PROXY_PORT=4001 \
    STATIC_DIR=/app/apps/frontend/dist
WORKDIR /app
# Keep the pnpm workspace layout. Node only strips types outside node_modules, and
# @proxy-moxy/shared (TypeScript sources) is reached through a symlink into packages/shared.
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/backend/node_modules apps/backend/node_modules
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/backend/package.json apps/backend/
COPY apps/backend/src apps/backend/src
COPY --from=build /app/apps/frontend/dist apps/frontend/dist
USER node
EXPOSE 4000 4001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# main.ts closes both listeners on SIGTERM, so `docker stop` shuts down cleanly.
CMD ["node", "apps/backend/src/main.ts"]
