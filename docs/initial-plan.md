### Mirrorball — Initial Project Plan (for Junie AI agent)

#### 1) Objectives and Scope

- Build a simple website where authenticated users can:
  - Upload images to S3 (role: dev and admin)
  - List/search images stored in S3 (both roles)
  - Delete images (role: admin only)
- Each image has: owner (user id or username), upload time, dev name, and a public URL.
- Keep database and API as simple as possible.
- Infrastructure provisioned with Pulumi on AWS.
- Static website built with Vite and served via the same S3 bucket and a CloudFront distribution (site + images).
- Define users, roles (dev, admin), and required permissions in-repo (AWS permissions file + Pulumi wiring).
- Prefer no serverless functions. If an API is needed, implement it as a long-running Bun service deployed as a container (no Lambdas).

Type sharing and runtime validation

- Frontend and backend must share TypeScript types and Zod schemas from a common Nx library for all request/response payloads and core entities (e.g., `Image`, `PresignUploadInput`, `PresignUploadOutput`).
- Use Zod for runtime validation at API boundaries. Types are inferred from schemas via `z.infer`, ensuring a single source of truth.

Config-driven email domain restriction

- Add a simple configuration to restrict who can upload based on email domain(s). Only users whose `email` claim ends with an allowed domain may access upload/delete endpoints. This must be configurable per environment (e.g., `example.com`).

Notes

- Monorepo: Nx will manage the workspace, tasks, and caching for frontend, API, and infra.
- Pulumi is the IaC tool. The frontend and backend will both use a JS/TS package manager (pnpm); Bun will manage backend code where used. This plan uses Pulumi to orchestrate infra, not as an app package manager.

#### 2) High-Level Architecture (Nx monorepo, Bun API service, no Lambdas)

- Region: Default deployment region is `us-west-2`.
- Auth: Amazon Cognito Hosted UI + Cognito User Pool. Two groups: dev, admin.
- API: Single Bun web service (containerized) exposes minimal endpoints. No API Gateway, no Lambda. Deployed on AWS App Runner in `us-west-2` (fallback to ECS Fargate only if App Runner is unavailable).
- Uploads: Frontend calls the Bun API to obtain pre-signed S3 PUT URLs. API validates JWT (Cognito) and role (group claim).
- Metadata: DynamoDB single-table for image metadata (owner, uploadTime, devName, s3Key, publicUrl). API performs writes/reads.
- Public URL: CloudFront distribution with two origins: S3 (site + images prefixes) and API origin (App Runner/ECS). CloudFront routes `/api/*` to the API origin and everything else to S3. S3 remains private using CloudFront OAC.

Email domain control options (no Lambdas required)

- Primary (simple, immediate): API-level enforcement. The Bun API reads an `ALLOWED_EMAIL_DOMAINS` config (comma-separated list) and rejects upload/delete endpoints when the Cognito token `email` claim is not in an allowed domain. Listing/search remains available to authenticated users regardless of domain. If `ALLOWED_EMAIL_DOMAINS` is not set or is empty, no domain restriction is applied (uploads/deletes allowed subject to role checks only).
- Optional (stronger at identity layer): Use Cognito federated IdP with a Google Workspace OIDC provider restricted to your company domain. Disable native signup/self-registration to ensure only employees can sign in via Workspace. This requires adding a Cognito OIDC provider but no Lambda triggers.

#### 3) Roles & Authorization Model

- Roles: dev, admin.
- Both can list and search images.
- dev can upload; admin can upload and delete.
- Cognito groups are carried as JWT claims. The Bun API validates tokens (User Pool JWKS) and authorizes by `cognito:groups` claim.
- Keep S3 bucket private; access via CloudFront (public read) and pre-signed URLs for uploads; deletes only by admin via API call.

Email domain allowlist enforcement

- New policy layer: Upload and delete actions require that the authenticated user's `email` claim ends with one of the configured allowed domains (e.g., `@example.com`). If not matched, return HTTP 403.
- This check is orthogonal to roles. A user must both have the correct role and pass the domain check to upload/delete.

#### 4) Data Model (DynamoDB single-table)

Table: Images

- PK: `imageId` (ULID)
- SK: none (simple primary key)
- Attributes:
  - `owner` (string)
  - `devName` (string)
  - `uploadTime` (ISO 8601 string)
  - `s3Key` (string; folder + filename)
  - `publicUrl` (string; CloudFront URL)
  - Optional: `tags` (string array) for basic search; else search on owner/devName/s3Key prefix.

Indexes (only if needed for search):

- GSI1: `owner` (PK) with `uploadTime` (SK) for listing by owner, newest-first.
- GSI2: `devName` (PK) with `uploadTime` (SK) for listing by dev name.
  Keep it minimal initially: implement GSI1 only; add GSI2 if necessary.

#### 5) API Design (minimal)

Base path: `/api`

- `POST /api/presign-upload` → returns `{ uploadUrl, objectKey, publicUrl, imageId }`
  - Auth: dev, admin
  - Input: `{ contentType, fileName, devName }`
  - Side effects: creates metadata stub (imageId, s3Key, owner, devName, uploadTime=now, publicUrl) in DynamoDB (status: "pending")
- `POST /api/confirm-upload` → marks metadata as "complete" after client confirms upload success
  - Auth: dev, admin
  - Input: `{ imageId }`
- `GET /api/images` → list/search images
  - Auth: dev, admin
  - Query params: `owner?`, `devName?`, `prefix?`, `limit?`, `cursor?`
- `DELETE /api/images/:imageId` → delete image object and metadata
  - Auth: admin only

Implementation: Bun HTTP service (e.g., using `Bun.serve` or Hono) running as a container. Verifies Cognito JWT (via JWKS). Uses AWS SDK v3 for JavaScript for S3 pre-sign and DynamoDB access. Exposed through CloudFront path routing to App Runner/ECS service.

Schema-first contracts with Zod

- Define request/response schemas in a shared Nx lib (see Section 14 Tasks). Example schemas:
  - `PresignUploadInput = z.object({ contentType: z.string(), fileName: z.string().min(1), devName: z.string().min(1) })`
  - `PresignUploadOutput = z.object({ uploadUrl: z.string().url(), objectKey: z.string(), publicUrl: z.string().url(), imageId: z.string() })`
  - `Image = z.object({ imageId: z.string(), owner: z.string(), devName: z.string(), uploadTime: z.string(), s3Key: z.string(), publicUrl: z.string().url() })`
- API must `safeParse` inputs and return HTTP 400 with issues when invalid.
- API must serialize outputs using the schemas to ensure shape stability.

Authorization details

- In addition to role checks, enforce an email domain allowlist for mutating endpoints (presign-upload, confirm-upload, delete). Pseudocode:
  - Parse `email` from ID token claims.
  - If `ALLOWED_EMAIL_DOMAINS` is set and non-empty, ensure `email.toLowerCase().endsWith('@' + anyAllowedDomain)`. Otherwise (unset or empty), allow by default (no domain restriction).
  - If not matched, return 403 with message "Uploads restricted to company domain".

#### 6) Frontend (Vite)

- Tech: Vite + React (or vanilla) + TypeScript.
- Auth: Cognito Hosted UI or Amplify Auth minimal wrapper (only client-side OAuth flow); alternatively use AWS SDK + cognito-auth-js.
- Features:
  - Login/Logout, show role in UI.
  - Upload form: file selector, devName field, calls `presign-upload`, PUT to S3, then call `confirm-upload`.
  - Images list: infinite scroll/pagination; filters by owner/devName/prefix; show thumbnail (CloudFront URL) + metadata; search field.
  - Delete button for admin only.
- Build: emitted assets uploaded to the same S3 bucket under `site/` prefix; images under `images/` prefix. Prefer one bucket with prefixes.
- Nx: Frontend is an Nx app named `web` (`apps/web`), with tasks `nx serve web` and `nx build web`.

Shared types usage

- Import Zod schemas and inferred types from the shared Nx library. Use them to validate any data coming from the API (optional client-side safety) and to type API client functions.

UX note for domain restriction

- Read a public config var `VITE_ALLOWED_EMAIL_DOMAINS` (optional) to display an informative message on the upload screen if the signed-in user’s email is not in an allowed domain, and disable the upload button client-side. Server remains the source of truth.

#### 7) Infrastructure (Pulumi, AWS)

Stacks: `dev` (default)
Resources:

- S3 bucket: `mirrorball-bucket`
  - Folders (prefixes): `site/`, `images/`
  - Block public access; enforce CloudFront OAC for reads
- CloudFront distribution
  - Origin: S3 (OAC)
  - Behaviors:
    - Default: serve `site/` prefix (SPA fallback to index.html)
    - Path pattern `/images/*`: serve images path
    - Path pattern `/api/*`: route to API origin (App Runner/ECS), disable caching for auth-protected endpoints
  - Cache policies: standard static; set proper content types
- Cognito
  - User Pool + App Client (Hosted UI)
  - User Groups: `dev`, `admin`
  - (Optional) Identity Pool not required; tokens validated by API directly
  - Optional: Google Workspace OIDC provider restricted to your company domain; disable native signup if using federated login
- DynamoDB: `Images` table (on-demand capacity)
- Containerized Bun API Service
  - Container registry: ECR repository
  - Service platform: App Runner in `us-west-2` (simpler) or ECS Fargate (only if necessary).
  - Networking: Public HTTPS endpoint; CloudFront routes `/api/*` to this origin
- IAM roles and policies
  - Service execution role with least-privilege access to S3 bucket (scoped to `images/*`), DynamoDB table, and CloudWatch Logs
  - ECR pull permissions for the service
  - CloudFront OAC permissions to S3
  - Two GitHub OIDC deploy roles:
    - `mirrorball-deployer` — permissions to deploy/update (Pulumi up), build/push images, sync site.
    - `mirrorball-destroyer` — permissions to destroy the stack (Pulumi destroy). Use only in a dedicated GitHub Action workflow.

Outputs:

- `cloudFrontDomainName`, `bucketName`, `userPoolId`, `userPoolClientId`, `apiBaseUrl`, `tableName`.

Data access approach (DynamoDB — no ORM)

- Use AWS SDK v3 DynamoDB Document Client (v3) with small helper functions (no ORM). Keep marshalling simple and enforce shapes with Zod at the edges.
- Provide a tiny repository layer in the API: `imagesRepo.ts` with functions `putImage`, `getImage`, `deleteImage`, `queryImagesByOwner`, and optional `scanByPrefix` patterns.
- Rationale: smallest dependency surface, explicit control over keys/indexes, excellent fit for Bun.
- Future note: Reassess only if data access complexity grows substantially; do not introduce an ORM in the MVP.

#### 8) AWS Permissions File (in-repo)

Create `apps/infra/permissions/policies.json` containing:

- Managed policies JSON for:
  - `ServiceImagesRWPolicy` (S3 images prefix R/W, DynamoDB R/W)
  - `ServiceLogsPolicy` (CloudWatch Logs)
  - `CloudFrontOACReadPolicy` (S3 GetObject via OAC principal)
- Reference them in Pulumi program when creating roles.

#### 9) Local Development

- Nx workspace at repo root. Use `pnpm`.
- Frontend: `nx serve web` with environment variables `VITE_API_BASE_URL`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_CLOUDFRONT_DOMAIN`.
- Bun API service: `nx serve api` (wrapper for `bun --watch apps/api/src/main.ts`), runs on localhost with JWT validation against Cognito JWKS. Configure local `.env` for AWS creds or use a named AWS profile.
- Domain restriction config for dev: set `ALLOWED_EMAIL_DOMAINS=example.com` in the API environment. Optionally set `VITE_ALLOWED_EMAIL_DOMAINS=example.com` for the frontend.
- Pulumi: `nx run infra:up` (wrapper around `pulumi up`) against `dev` stack. Pulumi program resides in `apps/infra/`.

Shared library development

- Shared schemas/types live in `libs/shared-schemas` (or `libs/shared`), exported as ESM. Both `apps/api` (Bun) and `apps/frontend` (Vite) import from this lib.
- Ensure `tsconfig` path mappings or Nx project references are set so imports like `@mirrorball/shared-schemas` resolve in both apps.

#### 10) CI/CD (minimal)

- GitHub Actions (or none to start). Optional initial workflow:
  - Lint/build frontend
  - Build and push API Docker image to ECR
  - `pulumi preview` on PR
  - On main: build site, push API image, `pulumi up` (updates infra/service), sync `site/` to S3
  - Separate workflow: `destroy.yml` triggered manually (workflow_dispatch) that assumes the `mirrorball-destroyer` role via OIDC and runs `pulumi destroy` for the specified stack.

  Type safety in CI
  - Add a CI step to type-check the shared library and both apps against it (e.g., `nx run-many -t typecheck`). Fail the build if any contract drift occurs.

Note: Prefer GitHub Actions for deployments over manual CLI. The plan below (Sections 12, 14, and the new Section 17) formalizes this and asks for docs alongside apps.

Two-stage deployment flow

- Stage 1 (Infra provisioning): Pulumi creates/updates all AWS resources that do not depend on CI-provided connection details: S3 bucket, CloudFront + OAC, DynamoDB, Cognito (pool + app client), ECR repo, App Runner service skeleton (can be created without final image/envs), IAM roles/policies. Outputs include ARNs and names needed by CI.
- Stage 2 (Service wiring via CI env): GitHub Actions supplies connection/env details (e.g., image URI, `ALLOWED_EMAIL_DOMAINS`, OIDC role ARNs) as environment variables/vars at workflow time. Pulumi reads these from stack config or environment to update the App Runner service to the desired image and environment variables. This separates immutable infra from frequently changing configuration.

Secrets/variables strategy

- OIDC role ARNs: set as GitHub repository/environment variables (e.g., `AWS_ROLE_DEPLOYER_ARN`, `AWS_ROLE_DESTROYER_ARN`); referenced only by workflows, not committed in code.
- ECR repository name/URI: Pulumi creates the ECR repository and exports `ecrRepositoryUri`. CI reads it via `pulumi stack output` or uses a mirrored GitHub variable. Image tags use the commit SHA.
- App Runner connection: image URI and env vars (e.g., `ALLOWED_EMAIL_DOMAINS`) are provided in Stage 2; Pulumi updates the service accordingly.

#### 11) Non-Functional Requirements

- Simplicity first; prefer minimal code and least AWS services needed.
- Least-privilege IAM for all services.
- Idempotent Pulumi deployments.
- Reasonable costs: on-demand DynamoDB, App Runner (or minimal ECS), CloudFront.
- Configurability: Allowed email domains must be controlled via Pulumi stack config and surfaced as environment variables to API (and optionally frontend) without code changes.
- Contract single source of truth: All API request/response and core entity shapes are defined once in Zod schemas under the shared library; both apps consume inferred types.

#### 12) Milestones & Deliverables

M1 — Repo bootstrap

- Folder structure:
  - Nx workspace with:
    - `apps/web` (Vite app)
    - `apps/api` (Bun API service)
    - `apps/infra/` (Pulumi program, permissions)
    - `libs/shared-schemas` (Zod schemas and inferred types for contracts)
    - `docs/` (this plan)
- Pulumi project + stack initialized
- Docs: `docs/infra-setup.md` initial draft with stack config, AWS roles, and GitHub OIDC instructions
- Root `README.md`: add a "Docs" index linking to all subdocs under `docs/` (see Section 17 cross-linking conventions)

M2 — Infra MVP

- S3 bucket, CloudFront with OAC, basic distribution
- Cognito User Pool + App Client + groups (dev, admin)
- DynamoDB table
- Outputs exported

M3 — API Service MVP

- Bun service endpoints: `presign-upload`, `confirm-upload`, `list-images`, `delete-image`
- Containerization: Multi-stage Dockerfile for Bun API (builder + runtime), ECR repo, App Runner service created via Pulumi
- IAM roles/policies attached from `apps/infra/permissions/policies.json`
- Config: API reads `ALLOWED_EMAIL_DOMAINS` env and enforces domain allowlist for upload/delete
- Contracts: API validates inputs/outputs using shared Zod schemas; on 400/403 returns a JSON error shape defined in shared lib
- Docs: `docs/api-local-dev.md` (how to run API locally, required env vars) and `docs/api-deploy.md` (how CI deploys API)

M4 — Frontend (web) MVP

- Login/logout UI using Cognito Hosted UI
- Upload flow with pre-signed URL + confirm
- List/search page
- Delete (admin-only)
- Optional: If `VITE_ALLOWED_EMAIL_DOMAINS` is set, UI disables upload for users not in allowed domains (server remains authoritative)
- Contracts: Frontend imports shared types/schemas to type API client and optionally validate responses
- Docs: `docs/frontend-local-dev.md` (how to run locally) and `docs/frontend-deploy.md` (CI deploy steps)

M5 — Deploy & Verify

- Build site and sync to S3 `site/`
- Build and push API image; two-stage apply: (1) provision infra, (2) wire image/env and update App Runner via `pulumi up`
- Manual verification: login as dev/admin; upload, list/search, delete
- Docs: `docs/runbook.md` (end-to-end runbook and verification checklist)
- CI: `destroy.yml` workflow present and documented; requires `mirrorball-destroyer` role to execute.

#### 13) Acceptance Criteria

- Auth works via Cognito Hosted UI; dev/admin groups enforced by API
- Upload succeeds; image publicly viewable through CloudFront
- Metadata persisted in DynamoDB with correct fields
- List/search returns expected results and is fast enough for initial scale
- Delete restricted to admin; removes S3 object and DB entry
- All resources created/updated via Pulumi; permissions defined in-repo
- Domain restriction: Users whose `email` is not in the configured allowed domain(s) cannot obtain upload pre-sign URLs nor delete images (403), while allowed-domain users can.
- Documentation cross-links: Root `README.md` contains a Docs index with links to all subdocs; each subdoc contains a link back to the root `README.md`.
- Shared contracts: A single Zod schema source compiles in both apps; API validates inputs and normalizes outputs against those schemas; CI typecheck catches drift.
- Data access: Minimal repository functions operate correctly against DynamoDB using the Document Client; no heavy ORM is required for MVP.

#### 14) Tasks for Junie (step-by-step)

1. Initialize repo structure

- Scaffold Nx workspace at repo root (pnpm)
- Create apps: `web` (Vite + React + TS), `api` (Bun HTTP service)
- Create `apps/infra/` (Pulumi TS program) and `apps/infra/permissions/`
- Add `.gitignore`, root `README.md` with a Docs index linking to all files in `docs/`
- Create `libs/shared-schemas` library with Zod (`zod` as dependency) exporting schemas and inferred types
- Create `docs/` placeholders for app-specific guides (see Section 17)

2. Pulumi setup

- Init Pulumi project in `apps/infra/` (TypeScript program)
- Define config schema for stack (region default `us-west-2`, domain optional)
- Add `allowedEmailDomains` (string list) stack config; default to `[]`. Example: `["example.com"]`

3. Permissions

- Create `apps/infra/permissions/policies.json` with the managed policies outlined

4. Core infra

- Create S3 bucket with prefixes and block public access
- Create CloudFront distribution with OAC; behaviors for `site/*`, `images/*`, and route `/api/*` to API origin; SPA rewrite
- Export `cloudFrontDomainName`, `bucketName`

5. Auth

- Create Cognito User Pool, App Client, Hosted UI domain (random), groups `dev` and `admin`
- Export `userPoolId`, `userPoolClientId`
- Optional: Configure Google Workspace OIDC provider restricted to company domain; disable self-signup if using federated login

6. Data

- Create DynamoDB table `Images` (on-demand); optionally GSI1 for owner+time
- Export `tableName`

7. API Service (Bun container)

- Implement endpoints in `apps/api`
- Add a tiny repo layer `imagesRepo.ts` using AWS SDK v3 Document Client helpers (put/get/delete/query)
- Validate all request/response bodies using the shared Zod schemas
- Add multi-stage Dockerfile for Bun API (Stage 1: build; Stage 2: slim runtime). Create ECR repo; build and push image
- Create App Runner service (or ECS Fargate) with execution role attached
- Wire Pulumi stack config `allowedEmailDomains` to App Runner/ECS service environment variable `ALLOWED_EMAIL_DOMAINS` (join list by comma); if empty or unset, the API will not apply any email-domain restriction.
- Export `apiBaseUrl`
- Write `docs/api-local-dev.md` and `docs/api-deploy.md` (include a back-link to the root `README.md` at the top of each)

8. IAM wiring

- Create execution role for the service and attach policies from `infra/permissions/policies.json`
- Configure CloudFront OAC permissions for bucket

9. Frontend app

- Scaffold Vite + React + TS in `apps/web/`
- Env config: `.env` with outputs from Pulumi
- Implement auth flow (Hosted UI), read groups from ID token
- Implement upload + confirm, list/search, admin delete
- Optional: Respect `VITE_ALLOWED_EMAIL_DOMAINS` to conditionally disable upload UI
- Consume shared Zod schemas for typing the API client and validating selected responses
- Build script to publish to S3 `site/`
- Write `docs/frontend-local-dev.md` and `docs/frontend-deploy.md` (each must include a back-link to the root `README.md`)

10. Deploy & test

- Build and push API image; perform two-stage deployment:
  - Stage 1: Provision/update core infra via `pulumi up` (resources only)
  - Stage 2: Update service wiring via `pulumi up` providing image URI and env vars from CI (e.g., `ALLOWED_EMAIL_DOMAINS`)
- Upload site assets to S3 `site/`
- Manual test scenarios for dev and admin
- Write `docs/runbook.md` (checklist for verification; include a back-link to the root `README.md`)
- Add `destroy.yml` workflow using OIDC to assume `mirrorball-destroyer` and run `pulumi destroy` (document in `docs/ci-cd.md` and `docs/infra-setup.md`).

#### 15) Open Questions / Decisions to Confirm

- Keep single bucket with `site/` and `images/` prefixes vs separate buckets? (Plan assumes single bucket.)
- Use Hosted UI redirect URIs tied to CloudFront domain only, or also localhost for dev? (Recommend both.)
- Do we need full-text search on metadata? (Plan assumes simple filters/prefix scans.)
- Prefer App Runner in target region; fallback to ECS Fargate if App Runner is unavailable. DECISION: Use App Runner in `us-west-2`.
- Domain control approach: DECISION — Option A (API-only allowlist via `allowedEmailDomains`). Behavior: if unset/empty, no restriction.
- DynamoDB data access:
  - Start with minimal helpers + Zod at edges (recommended for MVP), or adopt a library now?
  - If library: prefer DynamoDB Toolbox for ergonomics; confirm Bun compatibility in your environment.

#### 17) Documentation deliverables (living docs per app and infra)

- Cross-linking conventions (GitHub-friendly):
  - Root `README.md` must include a "Docs" section that links to all subdocs in `docs/` using relative links (e.g., `[Infra setup](docs/infra-setup.md)`).
  - Each subdoc placed in `docs/` must start with a small navigation line that includes a back-link to the root `README.md` (e.g., `Back to [root README](../README.md)`).
  - When adding new docs, update the root `README.md` Docs index in the same PR.
  - Keep link paths relative to the repository root to ensure they work in GitHub UI and locally.
- General rule: As each app/area is implemented, include or update a doc in `docs/` explaining how to develop, run, and deploy it via GitHub Actions. Minimum set:
  - `docs/infra-setup.md`
    - Pulumi stack config keys (region, allowedEmailDomains, etc.)
    - AWS requirements: IAM roles, OIDC trust for GitHub Actions, permissions boundaries if any
    - Two roles via OIDC: `mirrorball-deployer` (deploy/update) and `mirrorball-destroyer` (destroy). Detail least-privilege policies and guardrails.
    - How CI uses Pulumi (no local CLI required)
  - `docs/ci-cd.md`
    - GitHub Actions workflows overview
    - OIDC-based AWS auth (no long-lived secrets), required repo/environment secrets
    - Job steps for: build frontend, build/push API image to ECR, `pulumi preview` on PR, two-stage deploy on main (Stage 1 infra, Stage 2 wiring)
    - Destroy workflow: manual trigger (`workflow_dispatch`), assumes `mirrorball-destroyer`, runs `pulumi destroy` safely.
  - `docs/api-local-dev.md`
    - How to run the Bun API locally, env vars, token testing, example curl commands
  - `docs/api-deploy.md`
    - How the API is built and deployed via CI (image tags, ECR, App Runner/ECS update)
  - `docs/frontend-local-dev.md`
    - How to run Vite app locally, env vars mapping to Pulumi outputs, auth callbacks
  - `docs/frontend-deploy.md`
    - How the site is built and synced to S3 via CI, cache invalidation via CloudFront (if needed)
  - `docs/runbook.md`
    - End-to-end operational checklist: provisioning, first-time setup, rotating secrets (if any), verifying domain restriction and role enforcement, rollback steps

Preference: All deployments go through GitHub Actions using OIDC to assume AWS roles. Avoid manual `pulumi up` on developer machines.

#### 16) Next Action for Junie

- Proceed with M1 and M2: scaffold Nx workspace, Pulumi project, S3 + CloudFront (with API route) + Cognito + DynamoDB, and export stack outputs.
