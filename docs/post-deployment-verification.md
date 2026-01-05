Back to [root README](../README.md)

# Post-Deployment Verification (Runbook)

Use this checklist after a fresh deploy to validate that the infrastructure and application are working correctly.

## 1. Infrastructure Validation

- [ ] **Pulumi Outputs**: Verify that the following outputs are available (via `pulumi stack output` or Pulumi Cloud):
  - `cloudFrontDomainName`
  - `bucketName`
  - `userPoolId` and `userPoolClientId`
  - `imageTableName` and `configTableName`
  - `apiBaseUrl` (App Runner URL)

## 2. Authentication

- [ ] **Hosted UI**: Navigate to the Cognito Hosted UI and sign in.
- [ ] **User Groups**: In the AWS Console (Cognito), ensure your user is in the `dev` or `admin` group.
- [ ] **Role Display**: Upon logging into the web app, confirm your role is correctly displayed in the UI.

## 3. API Functional Checks

Use a tool like `curl` or Postman, or verify via the Web UI's Network tab:

- [ ] **Health Check**: `GET <apiBaseUrl>/health` (or `/api/health`) should return `200 OK` with `{"status":"ok"}`.
- [ ] **Presigned URL**: `POST /api/presign-upload` (with Auth header) should return a valid S3 upload URL.
- [ ] **Image Listing**: `GET /api/images` should return a list of images (empty array if none).
- [ ] **Admin Actions**: `DELETE /api/images/:id` should work for `admin` users and return `403` for `dev` users.

## 4. Frontend Verification

- [ ] **Static Assets**: The site loads successfully from the CloudFront domain.
- [ ] **Upload Flow**: Uploading an image completes and the new image appears in the list.
- [ ] **Thumbnails**: Image thumbnails load correctly from CloudFront.

## 5. Operations

- [ ] **GitHub Actions**: Deployment workflow completes without errors.
- [ ] **S3 Sync**: Files are correctly synced to `s3://<bucket>/site/`.
- [ ] **Invalidation**: CloudFront invalidation is triggered and completes.
- [ ] **Destroy (Optional)**: If testing teardown, the `mirror-ball-destroyer` role successfully removes all resources.
