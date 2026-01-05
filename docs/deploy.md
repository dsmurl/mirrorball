Back to [root README](../README.md)

# Deployment (via GitHub Actions)

The project includes a `deploy-preview.yml` workflow that runs automatically on Pull Requests to `main`.

## Previews

### What the preview workflow does

1. **Typecheck**: Runs Nx typecheck across the monorepo.
2. **Build API image**: Builds the Docker image locally to verify the `Dockerfile` and dependencies. It does _not_ push to ECR.
3. **Pulumi Preview**: Runs `pulumi preview` for the `dev` stack, showing what infrastructure changes would occur.
4. **Build Web**: Retrieves current stack outputs and attempts to build the web application to verify its compilation and environment variable wiring.

---

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

The following variables from `apps/web/.env.example` are automatically retrieved from Pulumi stack outputs during the
CI/CD process to build the production bundle:

- `VITE_API_BASE_URL`
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
- `PROJECT_NAME`: Your project prefix (e.g., `sams-images`). **Crucial**: This must match the `PROJECT_NAME` you use locally if you want to deploy to the same infrastructure. If left unset, it defaults to `mirror-ball`.

## Verifying the Web Deployment

The web assets are uploaded to the S3 bucket under the `site/` prefix. You can verify this in the AWS Console:

1. Go to **S3**.
2. Find your bucket (e.g., `mirror-ball-sams-images-dev-...`).
3. You should see a `site/` folder containing `index.html` and an `assets/` folder.

If the bucket is empty, check the GitHub Action logs for the "Sync site to S3" step.

## Viewing API Logs (AWS App Runner)

If the API is not behaving as expected, you can view the logs in the AWS Console:

1.  Navigate to **AWS App Runner** in the AWS Console.
2.  Select your service (e.g., `mirror-ball-sams-images-dev`).
3.  Click on the **Logs** tab.
4.  You will see two types of logs:
    - **Service logs**: These contain information about the App Runner service itself (deployment, health checks, etc.).
    - **Application logs**: These contain the output (`console.log`, `console.error`) from your Bun application.

Alternatively, you can find these logs directly in **CloudWatch Logs**:

- Log Group: `/aws/apprunner/<service-name>/<service-id>/application` for application output.
- Log Group: `/aws/apprunner/<service-name>/<service-id>/service` for service lifecycle events.

See also:

- [Infra setup](infra-setup.md)
- [Post-Deployment Verification](post-deployment-verification.md)
