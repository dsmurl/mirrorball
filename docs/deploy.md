Back to [root README](../README.md)

# Deployment (via GitHub Actions)

This project uses a unified GitHub Action to deploy both the API (containerized on App Runner) and the Frontend (static
site on S3/CloudFront).

## API Deployment

The API is containerized and deployed to AWS App Runner.

### What the workflow does

1. Build the API image from `apps/api/` and tag with the commit SHA.
2. Push the image to ECR.
3. Run `pulumi up` in `apps/infra/` to update the App Runner service to the new image and apply config.

### Note on Runtime Variables

The following variables from `apps/api/.env.example` are automatically managed by Pulumi and injected into the App
Runner service during deployment:

- `IMAGE_TABLE_NAME`
- `CONFIG_TABLE_NAME`
- `BUCKET_NAME`
- `USER_POOL_ID`
- `CLOUDFRONT_DOMAIN`

---

## Frontend (web) Deployment

The site is built with Vite and uploaded to the S3 bucket under the `site/` prefix.

### What the workflow does

1. Build the web app in `apps/web/`.
2. Sync `dist/` to `s3://<bucket>/site/` (delete removed files).
3. Create a CloudFront invalidation for `/*`.

### Note on Build Variables

The following variables from `apps/web/.env.example` are typically retrieved from Pulumi stack outputs during the CI/CD
process to build the production bundle:

- `VITE_USER_POOL_ID`
- `VITE_USER_POOL_CLIENT_ID`
- `VITE_COGNITO_DOMAIN`

---

## GitHub Setup (Secrets & Variables)

The following should be configured in your GitHub Environment (e.g., `dev`):

### Secrets

- `PULUMI_ACCESS_TOKEN`: Your Pulumi API token for state management.

### Variables

- `AWS_REGION`: The target AWS region (e.g., `us-west-2`).
- `AWS_ROLE_DEPLOYER_ARN`: The ARN of the `mirror-ball-creator` IAM role.
  - Note: Role ARNs are identifiers and are safe to store as Variables; they require OIDC trust to be assumed.
- `PROJECT_NAME`: Your project prefix (e.g., `sams-images`).
- `VITE_API_BASE_URL`: The URL of your deployed API (e.g. `https://xxx.cloudfront.net/api`).
- `PORT`: (Optional) API port, defaults to `8080`.

See also:

- [Infra setup](infra-setup.md)
- [Post-Deployment Verification](post-deployment-verification.md)
