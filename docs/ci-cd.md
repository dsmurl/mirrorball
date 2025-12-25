Back to [root README](../README.md)

# CI/CD (GitHub Actions)

This repo deploys exclusively via GitHub Actions using OIDC to assume AWS roles. No long-lived AWS keys in secrets.

## Roles assumed via OIDC

- `mirrorball-deployer` — for preview and deploy (Pulumi preview/up), building and pushing the API image to ECR, syncing the site to S3, and invalidating CloudFront.
- `mirrorball-destroyer` — for destroying the stack via a manual workflow.

## Workflows (planned)

- pr-preview.yml — on PRs: type-check/build, Pulumi preview.
- deploy.yml — on push to main: build site, build/push API image, Pulumi up, S3 sync, CloudFront invalidation.
- destroy.yml — manual (workflow_dispatch): assume `mirrorball-destroyer` and run Pulumi destroy on selected stack.

See `docs/infra-setup.md` for IAM setup details.
