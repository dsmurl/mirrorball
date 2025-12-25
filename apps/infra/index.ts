// Config
const config = new pulumi.Config();
const region = config.get("region") ?? "us-west-2";
const allowedEmailDomains = config.getObject<string[]>("allowedEmailDomains") ?? [];
const commonTags: aws.types.input.tags.TagArgs = {
  project: "mirrorball",
  managedBy: "pulumi",
  environment: pulumi.getStack(),
};
const imageTag = config.get("imageTag") ?? "bootstrap"; // CI sets this in Stage 2

// 1) S3 bucket (private) with prefixes for site/ and images/
const bucket = new aws.s3.Bucket("mirrorballBucket", {
  bucketPrefix: "mirrorball-",
  forceDestroy: false,
  tags: commonTags,
});

// Block all public ACLs/policies; access will be via CloudFront OAC (to be added in a subsequent step)
const bucketPublicAccess = new aws.s3.BucketPublicAccessBlock("mirrorballBucketPab", {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// 2) DynamoDB table (on-demand)
const imagesTable = new aws.dynamodb.Table("mirrorballImagesTable", {
  attributes: [{ name: "imageId", type: "S" }],
  hashKey: "imageId",
  billingMode: "PAY_PER_REQUEST",
  tags: commonTags,
});

// 3) Cognito User Pool and App Client (Hosted UI domain can be added later)
const userPool = new aws.cognito.UserPool("mirrorballUserPool", {
  schema: [{ attributeDataType: "String", name: "email", required: true, mutable: true }],
  autoVerifiedAttributes: ["email"],
  adminCreateUserConfig: {
    allowAdminCreateUserOnly: false,
  },
  tags: commonTags,
});

const userPoolClient = new aws.cognito.UserPoolClient("mirrorballUserPoolClient", {
  userPoolId: userPool.id,
  generateSecret: false,
  allowedOauthFlows: ["code"],
  allowedOauthFlowsUserPoolClient: true,
  allowedOauthScopes: ["email", "openid", "profile"],
  callbackUrls: [
    // localhost for dev; CloudFront domain will be appended later via update
    "http://localhost:5173/",
  ],
  logoutUrls: ["http://localhost:5173/"],
  supportedIdentityProviders: ["COGNITO"],
  preventUserExistenceErrors: "ENABLED",
});

// User groups: dev and admin
const devGroup = new aws.cognito.UserGroup("mirrorballDevGroup", {
  userPoolId: userPool.id,
  name: "dev",
  precedence: 10,
});

const adminGroup = new aws.cognito.UserGroup("mirrorballAdminGroup", {
  userPoolId: userPool.id,
  name: "admin",
  precedence: 5,
});

// 4) ECR repository for API images
const ecrRepo = new aws.ecr.Repository("mirrorballApiRepository", {
  name: pulumi.interpolate`mirrorball-api-${pulumi.getStack()}`,
  imageScanningConfiguration: { scanOnPush: true },
  tags: commonTags,
});

// (moved below App Runner so we can wire /api/* to it)

// Outputs
export const deploymentRegion = region;
export const bucketName = bucket.bucket;
export const tableName = imagesTable.name;
export const userPoolId = userPool.id;
export const userPoolClientId = userPoolClient.id;
export const ecrRepositoryUri = ecrRepo.repositoryUrl;
export const allowedDomains = pulumi.output(allowedEmailDomains);
// Placeholder (set after distribution is created below)
export const cloudFrontDomainName = pulumi.output("<pending>");
// 6) App Runner service (Stage 1 skeleton) — image tag will be updated by CI in Stage 2

// IAM role for App Runner to pull from ECR
const appRunnerAccessRole = new aws.iam.Role("mirrorballAppRunnerAccessRole", {
  name: pulumi.interpolate`mirrorball-apprunner-access-${pulumi.getStack()}`,
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        effect: "Allow",
        principals: [
          {
            type: "Service",
            identifiers: [
              "build.apprunner.amazonaws.com",
              "tasks.apprunner.amazonaws.com",
              "apprunner.amazonaws.com",
            ],
          },
        ],
        actions: ["sts:AssumeRole"],
      },
    ],
  }).json,
  tags: commonTags,
});

// Attach a managed policy for ECR pull (and logs)
const appRunnerAccessPolicy = new aws.iam.RolePolicyAttachment(
  "mirrorballAppRunnerAccessAttachment",
  {
    role: appRunnerAccessRole.name,
    policyArn: aws.iam.ManagedPolicies.AmazonEC2ContainerRegistryReadOnly,
  },
);

const appRunnerLogsPolicy = new aws.iam.RolePolicy("mirrorballAppRunnerLogsPolicy", {
  role: appRunnerAccessRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        effect: "Allow",
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ],
        resources: ["*"],
      },
    ],
  }).json,
});

const imageIdentifier = pulumi.interpolate`${ecrRepo.repositoryUrl}:${imageTag}`;

const appRunnerService = new aws.apprunner.Service("mirrorballApiService", {
  serviceName: pulumi.interpolate`mirrorball-api-${pulumi.getStack()}`,
  sourceConfiguration: {
    authenticationConfiguration: { accessRoleArn: appRunnerAccessRole.arn },
    imageRepository: {
      imageRepositoryType: "ECR",
      imageIdentifier: imageIdentifier,
      imageConfiguration: {
        port: "8080",
        runtimeEnvironmentVariables: [
          {
            name: "ALLOWED_EMAIL_DOMAINS",
            value: pulumi
              .output(allowedEmailDomains)
              .apply((arr) => (arr && arr.length ? arr.join(",") : "")),
          },
          { name: "AWS_REGION", value: region },
          { name: "BUCKET_NAME", value: bucket.bucket },
          { name: "TABLE_NAME", value: imagesTable.name },
          { name: "USER_POOL_ID", value: userPool.id },
          // CloudFront domain gets set after distribution creation; CI can re-run Stage 2 to update if needed
        ],
      },
    },
    autoDeploymentsEnabled: true,
  },
  healthCheckConfiguration: {
    protocol: "HTTP",
    path: "/api/health",
    interval: 10,
    timeout: 5,
    healthyThreshold: 1,
    unhealthyThreshold: 5,
  },
  instanceConfiguration: {
    cpu: "1024",
    memory: "2048",
  },
  tags: commonTags,
});

export const apiBaseUrl = appRunnerService.serviceUrl;

// 5) CloudFront OAC + Distribution (serves site/ and images/ + routes /api/* to App Runner)

// Origin Access Control for S3
const oac = new aws.cloudfront.OriginAccessControl("mirrorballOac", {
  name: pulumi.interpolate`mirrorball-oac-${pulumi.getStack()}`,
  description: "OAC for S3 origin (mirrorball)",
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

// Build CloudFront distribution with two origins: S3 and App Runner
const apiDomain = appRunnerService.serviceUrl.apply((u) => new URL(u).host);

const cfDistribution = new aws.cloudfront.Distribution("mirrorballCdn", {
  enabled: true,
  comment: pulumi.interpolate`mirrorball cdn (${pulumi.getStack()})`,
  origins: [
    {
      originId: "s3-origin",
      domainName: bucket.bucketRegionalDomainName,
      originAccessControlId: oac.id,
    },
    {
      originId: "api-origin",
      domainName: apiDomain,
      customOriginConfig: {
        originProtocolPolicy: "https-only",
        httpsPort: 443,
        originSslProtocols: ["TLSv1.2"],
      },
    },
  ],
  defaultRootObject: "index.html",
  defaultCacheBehavior: {
    targetOriginId: "s3-origin",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD"],
    cachedMethods: ["GET", "HEAD"],
    forwardedValues: { queryString: false, cookies: { forward: "none" } },
    minTtl: 0,
    defaultTtl: 3600,
    maxTtl: 86400,
  },
  orderedCacheBehaviors: [
    {
      pathPattern: "/api/*",
      targetOriginId: "api-origin",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      cachedMethods: ["GET", "HEAD", "OPTIONS"],
      forwardedValues: { queryString: true, cookies: { forward: "all" } },
      minTtl: 0,
      defaultTtl: 0,
      maxTtl: 0,
    },
    {
      pathPattern: "/images/*",
      targetOriginId: "s3-origin",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD"],
      cachedMethods: ["GET", "HEAD"],
      forwardedValues: { queryString: false, cookies: { forward: "none" } },
      minTtl: 0,
      defaultTtl: 86400,
      maxTtl: 31536000,
    },
  ],
  priceClass: "PriceClass_100",
  restrictions: { geoRestriction: { restrictionType: "none" } },
  viewerCertificate: { cloudfrontDefaultCertificate: true },
  // SPA fallback
  customErrorResponses: [{ errorCode: 404, responseCode: 200, responsePagePath: "/index.html" }],
  tags: commonTags,
});

// Bucket policy to allow CloudFront OAC to read objects
const bucketPolicy = new aws.s3.BucketPolicy("mirrorballBucketPolicy", {
  bucket: bucket.bucket,
  policy: pulumi.all(bucket.arn, cfDistribution.arn).apply(([bArn, distArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCloudFrontServicePrincipalReadOAC",
          Effect: "Allow",
          Principal: { Service: "cloudfront.amazonaws.com" },
          Action: ["s3:GetObject"],
          Resource: [`${bArn}/*`],
          Condition: { StringEquals: { "AWS:SourceArn": distArn } },
        },
      ],
    }),
  ),
});

// Update outputs now that CloudFront is created
export const cloudFrontDomainName = cfDistribution.domainName;
export const cloudFrontDistributionId = cfDistribution.id;

// IAM role for App Runner instances to access AWS resources (S3/DynamoDB)
const appRunnerInstanceRole = new aws.iam.Role("mirrorballAppRunnerInstanceRole", {
  name: pulumi.interpolate`mirrorball-apprunner-instance-${pulumi.getStack()}`,
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        effect: "Allow",
        principals: [
          {
            type: "Service",
            identifiers: ["tasks.apprunner.amazonaws.com", "apprunner.amazonaws.com"],
          },
        ],
        actions: ["sts:AssumeRole"],
      },
    ],
  }).json,
  tags: commonTags,
});

const appRunnerInstanceAccess = new aws.iam.RolePolicy("mirrorballAppRunnerInstanceAccess", {
  role: appRunnerInstanceRole.id,
  policy: pulumi.all([bucket.arn, imagesTable.arn]).apply(([bArn, tArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "S3ImagesRW",
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
          Resource: [bArn, `${bArn}/*`],
        },
        {
          Sid: "DynamoDBRW",
          Effect: "Allow",
          Action: [
            "dynamodb:PutItem",
            "dynamodb:GetItem",
            "dynamodb:DeleteItem",
            "dynamodb:Query",
            "dynamodb:UpdateItem",
            "dynamodb:Scan",
          ],
          Resource: [tArn, `${tArn}/index/*`],
        },
        {
          Sid: "CloudWatchLogs",
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:DescribeLogStreams",
          ],
          Resource: "*",
        },
      ],
    }),
  ),
});

// Update App Runner service to use the instance role (dependsOn ensures role exists first)
const appRunnerServiceConfig = new aws.apprunner.Service(
  "mirrorballApiServiceConfig",
  {
    serviceName: appRunnerService.serviceName,
    sourceConfiguration: {
      authenticationConfiguration: { accessRoleArn: appRunnerAccessRole.arn },
      imageRepository: {
        imageRepositoryType: "ECR",
        imageIdentifier: imageIdentifier,
        imageConfiguration: {
          port: "8080",
          runtimeEnvironmentVariables: [
            {
              name: "ALLOWED_EMAIL_DOMAINS",
              value: pulumi
                .output(allowedEmailDomains)
                .apply((arr) => (arr && arr.length ? arr.join(",") : "")),
            },
            { name: "AWS_REGION", value: region },
            { name: "BUCKET_NAME", value: bucket.bucket },
            { name: "TABLE_NAME", value: imagesTable.name },
            { name: "USER_POOL_ID", value: userPool.id },
            { name: "CLOUDFRONT_DOMAIN", value: cfDistribution.domainName },
          ],
        },
      },
      autoDeploymentsEnabled: true,
    },
    healthCheckConfiguration: appRunnerService.healthCheckConfiguration,
    instanceConfiguration: {
      cpu: "1024",
      memory: "2048",
      instanceRoleArn: appRunnerInstanceRole.arn,
    },
    tags: commonTags,
  },
  { dependsOn: [appRunnerService, appRunnerInstanceAccess] },
);
