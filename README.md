# Mirror-ball

Simple image upload and listing site with role-based access, built as an Nx monorepo. Frontend (Vite) and backend (Bun) share Zod schemas. Infra is provisioned with Pulumi on AWS (S3, CloudFront, Cognito, DynamoDB, App Runner).

## Docs

- [Initial plan](docs/initial-plan.md)
- [Infra setup](docs/infra-setup.md)
- [AWS Access with Granted](docs/aws-granted-setup.md)
- [CI/CD](docs/ci-cd.md)
- [API — local development](docs/api-local-dev.md)
- [API — deploy](docs/api-deploy.md)
- [Frontend — local development](docs/frontend-local-dev.md)
- [Frontend — deploy](docs/frontend-deploy.md)
- [Runbook](docs/runbook.md)

## Workspace

- Nx monorepo using pnpm
- Apps:
- `apps/web` — Vite + React
- `apps/api` — Bun HTTP service
- Libs:
- `libs/shared-schemas` — Zod schemas and inferred types
- Infra:
- `apps/infra/` — Pulumi TypeScript program

See the docs above for details.

## Run locally (quick start)

- Prerequisites: pnpm, Node LTS, Bun (for API)

1. Install deps

```
pnpm install
```

2. Start the API (Bun)

```
pnpm nx serve api
```

Environment variables commonly used by the API:

- `PORT` (default 8080)
- `AWS_REGION` (e.g., us-west-2)
- `BUCKET_NAME`, `TABLE_NAME` (from Pulumi outputs if pointing at AWS)
- `USER_POOL_ID` (Cognito User Pool ID)
- `ALLOWED_EMAIL_DOMAINS` (optional, comma-separated; if unset/empty, no domain restriction)

3. Start the web app (Vite)

```
pnpm nx serve web
```

Recommended `.env` in `apps/web/` (or export in your shell):

- `VITE_API_BASE_URL` — e.g., `http://localhost:8080/api` (local) or `https://<cloudfront-domain>/api`
- `VITE_USER_POOL_ID` — Pulumi output
- `VITE_USER_POOL_CLIENT_ID` — Pulumi output
- `VITE_CLOUDFRONT_DOMAIN` — CloudFront domain (for image/public URLs)
- `VITE_ALLOWED_EMAIL_DOMAINS` — optional; UI hint only

Notes:

- Contracts and types are shared from `libs/shared-schemas`.
- The API enforces role checks (Cognito groups) and optional email-domain allowlist.
