Back to [root README](../README.md)

# Frontend (web) — deploy (via GitHub Actions)

The site is built with Vite and uploaded to the S3 bucket under the `site/` prefix. CloudFront serves the site and images.

## What the workflow does (planned)

1. Build the web app in `apps/web/`.
2. Sync `dist/` to `s3://<bucket>/site/` (delete removed files).
3. Optionally create a CloudFront invalidation for `/*`.

## Required outputs

From Pulumi (in `apps/infra/`):

- `cloudFrontDomainName`
- `bucketName`

See also:

- [CI/CD overview](ci-cd.md)
- [Infra setup](infra-setup.md)
