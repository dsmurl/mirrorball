Back to [root README](../README.md)

# API — deploy (via GitHub Actions)

The API is containerized and deployed to AWS App Runner in `us-west-2`. Deployments run through GitHub Actions using OIDC to assume the `mirrorball-deployer` role.

## What the workflow does (planned)

1. Build the API image from `apps/api/` and tag with the commit SHA.
2. Push the image to ECR.
3. Run `pulumi up` in `apps/infra/` to update the App Runner service to the new image and apply config (e.g., `ALLOWED_EMAIL_DOMAINS`).

## Required AWS/Pulumi config

- Pulumi stack config (in `apps/infra/`):
  - `region`: `us-west-2` (default)
  - `allowedEmailDomains`: string list (optional). If absent/empty, no domain restriction is enforced by the API.

## GitHub secrets/vars

- None for AWS keys; OIDC is used. Configure the `mirrorball-deployer` IAM role trust policy for your repo and reference it in the workflow.

See also:

- [CI/CD overview](ci-cd.md)
- [Infra setup](infra-setup.md)
