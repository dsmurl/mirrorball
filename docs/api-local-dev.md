Back to [root README](../README.md)

# API — local development

This guide explains how to run the Bun API locally, configure env vars, and test endpoints.

## Prerequisites

- Bun (latest stable)
- pnpm
- AWS credentials (profile or env) if you want to hit real AWS services during dev

## Environment

- `PORT` (default: 8080)
- `COGNITO_USER_POOL_ID`
- `COGNITO_JWKS_URI` (derived from the pool region/id)

## Run

```
pnpm nx run api:dev
```

This runs `bun --watch apps/api/src/main.ts` under `apps/api` (via Nx) and serves on `http://localhost:8080`.

## Test

```
curl -s http://localhost:8080/health
```

When auth is implemented, include an `Authorization: Bearer <JWT>` header for protected endpoints.

## Notes

- The API will validate request bodies with Zod.
- Mutating endpoints will enforce role + optional email-domain allowlist.
