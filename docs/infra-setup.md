Back to [root README](../README.md)

# Infra setup

This document describes the Pulumi stacks, required AWS IAM roles, and GitHub OIDC configuration for deployments.

## Stacks and config

- Default region: `us-west-2`
- Config keys:
  - `region` (string, optional; defaults to `us-west-2`)
  - `allowedEmailDomains` (string list; optional; if absent/empty, no email-domain restriction)

## AWS IAM via GitHub OIDC

Create two roles trusted by your GitHub repo’s OIDC provider:

- `mirrorball-deployer` — deploy/update permissions: Pulumi up, ECR push, App Runner update, S3 sync, CloudFront invalidation, DynamoDB/Cognito updates.
- `mirrorball-destroyer` — destroy permissions: Pulumi destroy on the stack. Use only in a manual workflow.

Attach least-privilege policies. See `apps/infra/permissions/policies.json` as a starting point and customize as needed.

## Pulumi usage via CI

CI authenticates with AWS via OIDC and runs `pulumi preview` on PRs and `pulumi up` on main. No local Pulumi CLI is required to deploy.
