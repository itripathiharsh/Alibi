# Multi-stage production Dockerfile for ALIBI web dashboard
# Implements M0 Task 10, Next.js standalone build, and non-root execution

# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

# Copy workspace manifests and packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/design-tokens ./packages/design-tokens
COPY packages/domain-types ./packages/domain-types
COPY packages/api-client ./packages/api-client
COPY packages/sync-core ./packages/sync-core
COPY apps/web ./apps/web
COPY apps/mobile/package.json ./apps/mobile/package.json

ENV BUILD_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1 \
    BACKEND_INTERNAL_URL=http://api:8000 \
    NODE_ENV=production

# Install dependencies strictly from lockfile
RUN pnpm install --frozen-lockfile

# Build Next.js application in standalone mode
RUN pnpm --filter @alibi/web build

# Stage 2: Minimal runner
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -s /bin/sh nextjs

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --retries=5 --start-period=5s \
    CMD node -e "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "apps/web/server.js"]
