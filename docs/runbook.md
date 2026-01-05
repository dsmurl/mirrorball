Back to [root README](../README.md)

# Runbook — verification checklist

Use this checklist after a fresh deploy to validate core functionality.

## Pre-requisites

- GitHub OIDC roles exist: `mirror-ball-creator`, `mirror-ball-destroyer`.
- Pulumi stack configured in `apps/infra/` (region us-west-2).

## Infra validation

- Pulumi outputs collected:
  - CloudFront domain name
  - S3 bucket name
  - Cognito User Pool ID and App Client ID
  - DynamoDB table name
  - API base URL (App Runner)

## Auth

- Sign in via Cognito Hosted UI.
- Confirm `cognito:groups` contains `dev` for a dev user and `admin` for an admin user.

## API

- Health: `GET /api/health` returns 200.
- As dev/admin, request `POST /api/presign-upload` and receive a valid pre-signed URL.
- Upload file to S3 using the pre-signed URL and call `POST /api/confirm-upload`.
- Verify metadata written in DynamoDB.
- List: `GET /api/images` shows the new image.
- Delete: `DELETE /api/images/:imageId` works for admin; returns 403 for dev.
- Verify user restriction set via Admin Panel correctly blocks/allows users on mutating endpoints.

## Frontend

- App loads from CloudFront domain.
- Login works and displays user role.
- Upload flow completes and image appears in the list; thumbnails load from CloudFront.
- Admin-only delete is visible and functional.

## Operations

- Frontend deploy syncs `dist/` to `s3://<bucket>/site/`.
- Optional CloudFront invalidation executes successfully.
- Destroy workflow (`mirror-ball-destroyer`) removes all resources after confirmation.
