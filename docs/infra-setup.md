Back to [root README](../README.md)

# Infra setup

This document describes the Pulumi stacks, required AWS IAM roles, and GitHub OIDC configuration for deployments.

## Stacks and config

- Default region: `us-west-2`
- Config keys:
  - `aws:region` (string; required; the AWS region to deploy into)
  - `allowedEmailDomains` (string list; optional; if absent/empty, no email-domain restriction)

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

    # Set project-specific configs (defaults to 'mirror-ball-infra' namespace)
    pulumi config set --path 'allowedEmailDomains[0]' "example.com"
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
    - **Namespacing**: `aws:region` tells the AWS provider which region to use. Our code also reads this value to configure the App Runner service. `allowedEmailDomains` is a custom key; since it doesn't have a prefix, Pulumi automatically namespaces it to the project name (`mirror-ball-infra`).
    - `allowedEmailDomains` is optional. If you don't want to restrict by domain, you can skip it.

5.  **Preview the deploy**:

    ```bash
      pulumi preview
    ```

6.  **Deploy**:
    ```bash
    pulumi up
    ```
    _Note: This first deployment will likely fail on the App Runner service because the ECR repository is empty. This is expected. Follow the "Bootstrapping ECR" steps below to fix it._

### 7. Bootstrapping ECR (First Time Only)

App Runner cannot start without an image in ECR. Since your ECR repository was just created by Pulumi, it is currently empty.

1.  **Get your ECR repository URL** from the Pulumi outputs:
    Get the ECR repository URI from the Pulumi site when you login and view it in the stack
2.  **Authenticate Docker to AWS** (replace `<REGION>` and `<ACCOUNT_ID>`):
    ```bash
    assume   # your aws role
    aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
    ```
3.  **Build and push a "bootstrap" image**:
    You can use the provided API code to build the image. From the project root:
    ```bash
    docker build -t mirror-ball-api -f apps/api/Dockerfile .
    docker tag mirror-ball-api:latest <ECR_REPOSITORY_URI>:bootstrap
    docker push <ECR_REPOSITORY_URI>:bootstrap
    ```
4.  **Finish the Deployment**:
    Now that the image exists, run Pulumi again:
    ```bash
    cd apps/infra
    pulumi up
    ```

## Pulumi usage via CI

CI authenticates with AWS via OIDC and runs `pulumi preview` on PRs and `pulumi up` on main. No local Pulumi CLI is required to deploy.
