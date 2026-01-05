# mirror-ball

Welcome to the best mirror ball project ever!
Rated the best image hosting project of 2025 by [New York Timus](https://elementor.com/blog/best-free-image-hosting-sites/).

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
pnpm nx run api:dev
```

Environment variables commonly used by the API (place in `apps/api/.env`):

- `PORT` (default 8080)
- `AWS_REGION` (e.g., us-west-2)
- `IMAGE_TABLE_NAME` - from `pulumi stack output`
- `CONFIG_TABLE_NAME` - from `pulumi stack output`
- `BUCKET_NAME` - from `pulumi stack output`
- `CLOUDFRONT_DOMAIN` - from `pulumi stack output`
- `USER_POOL_ID` - from `pulumi stack output`

3. Start the web app (Vite)

```
pnpm nx run web:dev
```

Recommended `.env` in `apps/web/`:

- `VITE_API_BASE_URL` — e.g., `http://localhost:8080/api`
- `VITE_USER_POOL_ID` - from `pulumi stack output`
- `VITE_USER_POOL_CLIENT_ID` - from `pulumi stack output`
- `VITE_COGNITO_DOMAIN` - from `pulumi stack output` (e.g., `https://<domain>.auth.us-west-2.amazoncognito.com`)

Notes:

- Contracts and types are shared from `libs/shared-schemas`.
- The API enforces role checks (Cognito groups) and optional email-domain allowlist.
