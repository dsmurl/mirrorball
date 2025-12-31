# Multi-stage Dockerfile for Bun API (builder + runtime)
FROM oven/bun:1.1 AS builder
WORKDIR /workspace

# Copy root lockfile and package.json if needed for workspace resolution
# Since we are in a monorepo, we might need some shared files.
COPY package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY libs/shared-schemas ./libs/shared-schemas

# Install dependencies for the whole workspace (or just api)
# Bun can install pnpm lockfiles
RUN bun install

COPY apps/api/src ./apps/api/src

FROM oven/bun:1.1-slim
WORKDIR /app

# Copy from builder
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/src ./apps/api/src
COPY --from=builder /workspace/libs/shared-schemas ./libs/shared-schemas

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "apps/api/src/main.ts"]
