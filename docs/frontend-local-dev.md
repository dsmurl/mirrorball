Back to [root README](../README.md)

# Frontend (web) — local development

## Prerequisites

- pnpm

## Run

```
pnpm nx run web:dev
```

Serves on `http://localhost:5173` by default.

## Environment variables

Create `.env` in `apps/web/` (or use your shell) with:

- `VITE_API_BASE_URL` — e.g., `https://<cloudfront-domain>/api`
- `VITE_USER_POOL_ID` — from Pulumi output
- `VITE_USER_POOL_CLIENT_ID` — from Pulumi output
- `VITE_COGNITO_DOMAIN` — from Pulumi output (e.g., `https://mirror-ball-dev-123.auth.us-west-2.amazoncognito.com`)
- `VITE_CLOUDFRONT_DOMAIN` — CloudFront domain (for image/public URLs)

## Notes

- Contracts and types are shared from `libs/shared-schemas`.
- Auth uses Cognito Hosted UI; for dev, ensure localhost redirect URIs are configured in the User Pool App Client.
