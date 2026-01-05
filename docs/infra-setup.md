Back to [root README](../README.md)

# Infra setup

This document describes the Pulumi stacks, required AWS IAM roles, and GitHub OIDC configuration for deployments.

## Stacks and config

- Default region: `us-west-2`
- Config keys:
  - `aws:region` (string; required; the AWS region to deploy into)

## PROJECT_NAME and FORCE_USE_PUBLIC_IMAGE Prefix

You can deploy multiple independent instances of the project by setting the `PROJECT_NAME` environment variable before running Pulumi commands. This prefix is added to all AWS resource names and tags.

You can also control whether to force a public Nginx image (Skeleton Mode) by setting `FORCE_USE_PUBLIC_IMAGE`.

1.  **Create your `.env` file** (optional, for local reference):

    ```bash
    cp apps/infra/.env.example apps/infra/.env
    # Edit apps/infra/.env to set your desired PROJECT_NAME and FORCE_USE_PUBLIC_IMAGE
    ```

2.  **Run Pulumi**:
    With `.env` configured, the project will automatically pick up these variables when you run Pulumi commands:

    ```bash
    pulumi up
    ```

    Alternatively, you can still override them in your shell:

    ```bash
    export PROJECT_NAME=cat-project
    export FORCE_USE_PUBLIC_IMAGE=true
    pulumi up
    ```

## Kickstart Guide

To get this infrastructure running in AWS for the first time:

## Manual AWS Setup (One-time)

Before CI can take over, you need to manually set up the OIDC provider, the IAM policies, and the initial roles:

### 1. Configure GitHub OIDC Provider

1.  Go to **IAM** -> **Identity Providers** -> **Add Provider**.
2.  Choose **OpenID Connect**.
3.  Provider URL: `https://token.actions.githubusercontent.com`
4.  Audience: `sts.amazonaws.com`

### 2. Create IAM Policies

Create the two permission policies that will be attached to the roles:

1.  Go to **IAM** -> **Policies** -> **Create policy**.
2.  Select the **JSON** tab.
3.  For the first policy (`mirror-ball-creator-policy`):
    - Copy and paste the content of [mirror-ball-creator-policy.json](../apps/infra/permissions/mirror-ball-creator-policy.json).
    - Click **Next**.
    - Policy name: `mirror-ball-creator-policy`.
    - Click **Create policy**.
4.  For the second policy (`mirror-ball-destroyer-policy`):
    - Click **Create policy** again.
    - Select the **JSON** tab.
    - Copy and paste the content of [mirror-ball-destroyer-policy.json](../apps/infra/permissions/mirror-ball-destroyer-policy.json).
    - Click **Next**.
    - Policy name: `mirror-ball-destroyer-policy`.
    - Click **Create policy**.

### 3. Create IAM Roles

Create the two roles trusted by your GitHub repo’s OIDC provider:

1.  For each role (`mirror-ball-creator` and `mirror-ball-destroyer`):
    1.  Go to **IAM** -> **Roles** -> **Create Role**.
    2.  Select **Custom trust policy**.
    3.  Paste the following **Trust Policy** (replace `<ACCOUNT_ID>` with your AWS Account ID):
        ```json
        {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {
                "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
              },
              "Action": "sts:AssumeRoleWithWebIdentity",
              "Condition": {
                "StringLike": {
                  "token.actions.githubusercontent.com:sub": "repo:dsmurl/mirror-ball:*"
                }
              }
            }
          ]
        }
        ```
    4.  Click **Next**.
    5.  On the **Add permissions** page:
        - Search for the policy you created in the previous step (e.g., `mirror-ball-creator-policy`).
        - Check the box next to it.
    6.  Click **Next**.
    7.  Name the role (e.g., `mirror-ball-creator`).
    8.  Click **Create role**.

### 4. Pulumi State Backend

This project uses Pulumi. You can use Pulumi Service (default) or an S3 bucket for state:

- **Pulumi Service**: Run `pulumi login` locally and create an organization/project.
- **S3 Backend**: Create an S3 bucket and set `PULUMI_BACKEND_URL=s3://<your-bucket-name>`.

### 5. GitHub Secrets

Add the following secrets to your GitHub repository:

- create a GitHub envorinment called `dev`
- set these variables
- `AWS_REGION`: e.g., `us-west-2`
- set these secrets
- `PULUMI_ACCESS_TOKEN`: Your Pulumi API token (if using Pulumi Service).

### 6. Local Configuration & First Deployment

If you want to run it locally:

1.  **Ensure you have AWS credentials configured**. It is highly recommended to use [Granted](./aws-granted-setup.md) to manage your AWS roles and sessions.
2.  **Install dependencies and navigate to the infra directory**:
    ```bash
    pnpm install
    cd apps/infra
    ```
3.  **Initialize the stack**:
    ```bash
    pulumi stack select dev --create
    ```
4.  **Set Local Variables**:
    Pulumi uses its own configuration system rather than a `.env` file. These settings are **stack-specific** (stored in `Pulumi.dev.yaml`) and often namespaced.

    Run the following commands:

    ```bash
    # Set the AWS provider region (namespaced to 'aws')
    # This is the single source of truth for the region.
    pulumi config set aws:region us-west-2
    ```

    ### Where are these values stored?
    1.  **Locally**: These values are saved in `apps/infra/Pulumi.dev.yaml`. You can open this file to see the plain-text configuration.
    2.  **In Pulumi Cloud**: When you run `pulumi up`, these values are uploaded to the Pulumi Service (if you are using it as your backend).
        - Go to [app.pulumi.com](https://app.pulumi.com).
        - Navigate to your **Organization** > **Project** (`mirror-ball-infra`) > **Stack** (`dev`).
        - Click on the **Settings** tab.
        - Select **Configuration** in the left sidebar.
        - You will see all your configuration keys and values there.

    _Note:_
    - **Stack-specific**: These values are unique to the `dev` stack. If you create a `prod` stack, you will need to set them again for that stack.
    - **Namespacing**: `aws:region` tells the AWS provider which region to use. Our code also reads this value to configure the App Runner service.

5.  **Preview the deploy**:

    ```bash
      pulumi preview
    ```

6.  **Deploy**:
    ```bash
    pulumi up
    ```
    _Note: To avoid the "bootstrap" failure below, you can perform a "Skeleton Deploy" first (see section 7)._

### 7. Skeleton Deploy (Auto-Detection)

To avoid the "Chicken and Egg" problem where App Runner fails because your ECR is empty, the infrastructure is designed to **automatically detect** if your image exists.

1.  **Initial Deploy**: When you run `pulumi up` for the first time, Pulumi will check your ECR repository. Since it's empty, it will automatically use a public Nginx image to build your entire infrastructure (S3, CloudFront, Cognito).
2.  **Manual Override**: The project defaults to forcing a public image if not specified (`FORCE_USE_PUBLIC_IMAGE` defaults to `true`). If you want to **disable** Skeleton Mode and ensure Pulumi looks for your ECR image, you can set:

    ```bash
    # Disable Skeleton Mode (force use of ECR image)
    export FORCE_USE_PUBLIC_IMAGE=false
    pulumi up
    ```

    Or set it in your `.env` file.

_Note on Health Checks:_ Pulumi is configured to use a static **HTTP health check** on the root path (`/`). Since the standard Nginx image returns a 200 OK on `/` and our API is also configured to handle `/`, the health check will pass for both the placeholder and your real application without needing to change the infrastructure configuration.

3.  **Deploy your real API**:
    Once the infrastructure is up, you must follow **Section 8** to build and push your real API image with the `:bootstrap` tag. Pulumi will automatically detect the new image and switch from Skeleton Mode to your real API on the next `pulumi up`.

### 8. Bootstrapping ECR (First Real API Image)

App Runner cannot start your actual API without an image in ECR. While Skeleton Mode uses Nginx, you need to push your real application code to ECR using the `:bootstrap` tag to complete the setup.

**Note:** This step is only required if you want to deploy the first real image **manually from your local machine**. If you prefer, you can skip this manual push and let **GitHub Actions** handle the first real deployment by pushing your code to the `main` branch (after the infrastructure from Section 7 is up).

1.  **Get your ECR repository URL** from the Pulumi outputs:
    Get the ECR repository URI from the Pulumi site when you login and view it in the stack.
2.  **Authenticate Docker to AWS** (replace `<REGION>` and `<ACCOUNT_ID>`):
    ```bash
    assume   # your aws role
    aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
    ```
3.  **Build and push the "bootstrap" image**:
    This is your real API code, tagged as `bootstrap` so Pulumi can find it by default. From the project root:
    ```bash
    docker build -t mirror-ball-api -f apps/api/Dockerfile .
    docker tag mirror-ball-api:latest <ECR_REPOSITORY_URI>:bootstrap
    docker push <ECR_REPOSITORY_URI>:bootstrap
    ```
4.  **Switch from Skeleton to Real API**:
    Pulumi will automatically detect the new image on the next `pulumi up`. If you had manually forced Skeleton Mode (`FORCE_USE_PUBLIC_IMAGE=true`), you should unset it or set it to `false`:
    ```bash
    export FORCE_USE_PUBLIC_IMAGE=false
    pulumi up
    ```
    Otherwise, simply run:
    ```bash
    pulumi up
    ```

### 9. User Permissions (First Time Only)

By default, new users in Cognito do not have any permissions. You must manually add your user to a group to use the upload features:

1.  Log in to the **AWS Console**.
2.  Go to **Cognito** -> **User Pools** -> Select your pool (e.g., `mirror-ball-user-pool-dev`).
3.  Click on **Users** in the left sidebar.
4.  Select your user (the one you used to log in to the web app).
5.  Scroll down to **Group memberships** and click **Add user to group**.
6.  Select **dev** (or **admin**) and click **Add**.
7.  **IMPORTANT**: You must **Logout** and **Login** again in the web app for the new permissions to take effect.

## Pulumi usage via CI

CI authenticates with AWS via OIDC and runs `pulumi preview` on PRs and `pulumi up` on main. No local Pulumi CLI is required to deploy.

## Troubleshooting

### Service Already Exists Error

If `pulumi up` fails with `InvalidRequestException: Service with the provided name already exists: mirror-ball-api-dev`, it means there is an orphaned App Runner service in your AWS account that Pulumi is trying to recreate.

**Resolution:**

1.  **Delete the existing service** via the AWS Console (**App Runner** -> **Services** -> `mirror-ball-api-dev` -> **Delete**).
2.  **Wait** for the deletion to complete in the console.
3.  **Synchronize Pulumi**:
    ```bash
    cd apps/infra
    pulumi refresh
    ```
4.  **Redeploy**:
    ```bash
    pulumi up
    ```

### App Runner Service in `CREATE_FAILED` State

If `pulumi up` fails with an error stating that the App Runner service is in an unexpected state `CREATE_FAILED`, it means the service reached a terminal failure state. AWS does not allow updating a service in this state; it must be deleted and recreated.

**Steps to Resolve:**

1.  **Delete the service manually** (via AWS Console or CLI):
    ```bash
    aws apprunner delete-service --service-arn <SERVICE_ARN> --region <REGION>
    ```
2.  **Synchronize Pulumi state**:
    ```bash
    cd apps/infra
    pulumi refresh
    ```
    _(Select **yes** to remove the missing resource from your state)._
3.  **Redeploy**:
    ```bash
    pulumi up
    ```

### Image Repository Type Change Error

If you see an error like `The image repository type cannot be changed in UpdateService request`, this is because AWS App Runner does not allow switching between `ECR_PUBLIC` (Skeleton Mode) and `ECR` (Real API) on an existing service.

**Resolution:**
The Pulumi code is now configured with `replaceOnChanges` to handle this automatically by deleting and recreating the service when you switch modes. If you still encounter issues, follow the manual **App Runner Service in `CREATE_FAILED` State** steps above to clear the service and start fresh.

### Missing ECR Image

If App Runner fails to start with a "Health check failed" or "Image pull error," ensure you have pushed the `bootstrap` image to ECR as described in [Section 8](#8-bootstrapping-ecr-for-your-real-api).

### Switching Permissions for Up vs Destroy

If you are using a single IAM role or user for local development, you may need to swap its attached policy depending on whether you are building or tearing down the stack.

1.  **To Destroy the stack**:
    - Go to the **AWS Console** -> **IAM** -> **Roles** (or Users).
    - Select your deployment role (e.g., `mirror-ball-creator`).
    - Detach the `mirror-ball-creator-policy`.
    - Attach the `mirror-ball-destroyer-policy` (found in `apps/infra/permissions/mirror-ball-destroyer-policy.json`).
    - Run the destroy command:
      ```bash
      cd apps/infra
      pulumi destroy
      ```
2.  **To Deploy/Up the stack again**:
    - Go back to the **AWS Console**.
    - Detach the `mirror-ball-destroyer-policy`.
    - Re-attach the `mirror-ball-creator-policy` (found in `apps/infra/permissions/mirror-ball-creator-policy.json`).
    - Run the up command:
      ```bash
      cd apps/infra
      pulumi up
      ```
