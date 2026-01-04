import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Config
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");
const allowedEmailDomains = config.getObject<string[]>("allowedEmailDomains") ?? [];
const commonTags = {
  project: "mirror-ball",
  managedBy: "pulumi",
  environment: pulumi.getStack(),
};
const imageTag = config.get("imageTag") ?? "bootstrap"; // CI sets this in Stage 2

// 1) S3 bucket (private) with prefixes for site/ and images/
const bucket = new aws.s3.Bucket("mirror-ball-Bucket", {
  bucketPrefix: "mirror-ball-",
  forceDestroy: true,
  tags: commonTags,
});

// Add CORS configuration to the bucket to allow pre-signed uploads from the web app
const bucketCors = new aws.s3.BucketCorsConfiguration("mirror-ball-BucketCors", {
  bucket: bucket.id,
  corsRules: [
    {
      allowedHeaders: ["*"],
      allowedMethods: ["PUT", "POST", "GET", "HEAD"],
      allowedOrigins: ["http://localhost:5173", "https://*"], // Restrict https://* to your actual domain if possible
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3000,
    },
  ],
});

// Block all public ACLs/policies; access will be via CloudFront OAC (to be added in a subsequent step)
const bucketPublicAccess = new aws.s3.BucketPublicAccessBlock("mirror-ball-BucketPab", {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// 2) DynamoDB tables (on-demand)
const imagesTable = new aws.dynamodb.Table("mirror-ball-ImagesTable", {
  attributes: [
    { name: "imageId", type: "S" },
    { name: "title", type: "S" },
  ],
  hashKey: "imageId",
  billingMode: "PAY_PER_REQUEST",
  globalSecondaryIndexes: [
    {
      name: "TitleIndex",
      hashKey: "title",
      projectionType: "KEYS_ONLY",
    },
  ],
  tags: commonTags,
});

const configTable = new aws.dynamodb.Table("mirror-ball-ConfigTable", {
  attributes: [{ name: "configKey", type: "S" }],
  hashKey: "configKey",
  billingMode: "PAY_PER_REQUEST",
  tags: commonTags,
});

// 3) Cognito User Pool and App Client (Hosted UI domain added)
const userPool = new aws.cognito.UserPool("mirror-ball-UserPool", {
  schemas: [{ attributeDataType: "String", name: "email", required: true, mutable: true }],
  autoVerifiedAttributes: ["email"],
  adminCreateUserConfig: {
    allowAdminCreateUserOnly: false,
  },
  tags: commonTags,
});

const accountId = aws.getCallerIdentity().then((id) => id.accountId);

const userPoolDomainResource = new aws.cognito.UserPoolDomain("mirror-ball-UserPoolDomain", {
  domain: pulumi.interpolate`mirror-ball-${pulumi.getStack()}-${accountId}`,
  userPoolId: userPool.id,
});

const userPoolClient = new aws.cognito.UserPoolClient("mirror-ball-UserPoolClient", {
  userPoolId: userPool.id,
  generateSecret: false,
  allowedOauthFlows: ["code", "implicit"],
  allowedOauthFlowsUserPoolClient: true,
  allowedOauthScopes: ["email", "openid", "profile"],
  callbackUrls: ["http://localhost:5173/"],
  logoutUrls: ["http://localhost:5173/"],
  supportedIdentityProviders: ["COGNITO"],
  preventUserExistenceErrors: "ENABLED",
});

// User groups: dev and admin
const devGroup = new aws.cognito.UserGroup("mirror-ball-DevGroup", {
  userPoolId: userPool.id,
  name: "dev",
  precedence: 10,
});

const adminGroup = new aws.cognito.UserGroup("mirror-ball-AdminGroup", {
  userPoolId: userPool.id,
  name: "admin",
  precedence: 5,
});

// 4) ECR repository for API images
const ecrRepo = new aws.ecr.Repository("mirror-ball-ApiRepository", {
  name: pulumi.interpolate`mirror-ball-api-${pulumi.getStack()}`,
  imageScanningConfiguration: { scanOnPush: true },
  tags: commonTags,
});

// Outputs
export const deploymentRegion = region;
export const imageBucketName = bucket.bucket;
export const imagesTableName = imagesTable.name;
export const configTableName = configTable.name;
export const userPoolId = userPool.id;
export const userPoolClientId = userPoolClient.id;
export const userPoolDomain = userPoolDomainResource.domain.apply(
  (d) => `https://${d}.auth.${region}.amazoncognito.com`,
);
export const ecrRepositoryUri = ecrRepo.repositoryUrl;
export const allowedDomains = pulumi.output(allowedEmailDomains);
// Placeholder (set after distribution is created below)
// export const cloudFrontDomainName = pulumi.output("<pending>");
// 6) App Runner service (Stage 1 skeleton) — image tag will be updated by CI in Stage 2

// IAM role for App Runner to pull from ECR
const appRunnerAccessRole = new aws.iam.Role("mirror-ball-AppRunnerAccessRole", {
  name: pulumi.interpolate`mirror-ball-apprunner-access-${pulumi.getStack()}`,
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
  "mirror-ball-AppRunnerAccessAttachment",
  {
    role: appRunnerAccessRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerRegistryReadOnly,
  },
);

const appRunnerLogsPolicy = new aws.iam.RolePolicy("mirror-ball-AppRunnerLogsPolicy", {
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

// 6) App Runner instance role & policies
const appRunnerInstanceRole = new aws.iam.Role("mirror-ball-AppRunnerInstanceRole", {
  name: pulumi.interpolate`mirror-ball-apprunner-instance-${pulumi.getStack()}`,
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

const appRunnerInstanceAccess = new aws.iam.RolePolicy("mirror-ball-AppRunnerInstanceAccess", {
  role: appRunnerInstanceRole.id,
  policy: pulumi
    .all([bucket.arn, imagesTable.arn, configTable.arn, userPool.arn])
    .apply(([bArn, tArn, cArn, uArn]) =>
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
            Resource: [tArn, `${tArn}/index/*`, cArn],
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
          {
            Sid: "CognitoGroupManagement",
            Effect: "Allow",
            Action: ["cognito-idp:AdminAddUserToGroup"],
            Resource: [uArn],
          },
        ],
      }),
    ),
});

// CloudFront OAC + Distribution (serves site/ and images/ + routes /api/* to App Runner)
// Defined as a function to handle the circular dependency with App Runner
const oac = new aws.cloudfront.OriginAccessControl("mirror-ball-Oac", {
  name: pulumi.interpolate`mirror-ball-oac-${pulumi.getStack()}`,
  description: "OAC for S3 origin (mirror-ball)",
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

// 6) App Runner service
const forceUsePublicImageConfig = config.getBoolean("forceUsePublicImage");

// Check if the ECR image exists (to auto-switch to Skeleton Mode if missing)
// We use a regular Promise check because Pulumi Outputs don't support a clean .catch() or error handler for missing resources during preview
const imageExists = pulumi.all([ecrRepo.name, imageTag]).apply(async ([repoName, tag]) => {
  try {
    const img = await aws.ecr.getImage({
      repositoryName: repoName,
      imageTag: tag,
    });
    return !!img.imageDigest;
  } catch {
    return false;
  }
});

// Logic: forceUsePublicImage "true" wins, otherwise check if the image exists
const usePublicImage = forceUsePublicImageConfig || imageExists.apply((exists: boolean) => !exists);

const imageConfiguration: aws.types.input.apprunner.ServiceSourceConfigurationImageRepositoryImageConfiguration =
  {
    port: "8080",
    runtimeEnvironmentVariables: {
      ALLOWED_EMAIL_DOMAINS: pulumi
        .output(allowedEmailDomains)
        .apply((arr: string[] | undefined) => (arr && arr.length ? arr.join(",") : "")),
      AWS_REGION: region,
      BUCKET_NAME: bucket.bucket,
      IMAGE_TABLE_NAME: imagesTable.name,
      CONFIG_TABLE_NAME: configTable.name,
      USER_POOL_ID: userPool.id,
      // CLOUDFRONT_DOMAIN: apiDomain, // REMOVED to break circular dependency
    },
  };

const sourceConfiguration: aws.types.input.apprunner.ServiceSourceConfiguration = usePublicImage
  ? {
      imageRepository: {
        imageIdentifier: "public.ecr.aws/nginx/nginx:latest",
        imageRepositoryType: "ECR_PUBLIC",
        imageConfiguration: { port: "80" },
      },
      autoDeploymentsEnabled: false,
    }
  : {
      authenticationConfiguration: { accessRoleArn: appRunnerAccessRole.arn },
      imageRepository: {
        imageRepositoryType: "ECR",
        imageIdentifier: pulumi.interpolate`${ecrRepo.repositoryUrl}:${imageTag}`,
        imageConfiguration: imageConfiguration,
      },
      autoDeploymentsEnabled: true,
    };

const appRunnerService = new aws.apprunner.Service(
  "mirror-ball-ApiService",
  {
    serviceName: pulumi.interpolate`mirror-ball-api-${pulumi.getStack()}`,
    sourceConfiguration: sourceConfiguration,
    healthCheckConfiguration: {
      protocol: "HTTP",
      path: "/",
      interval: 20,
      timeout: 10,
      healthyThreshold: 1,
      unhealthyThreshold: 10,
    },
    instanceConfiguration: {
      cpu: "1024",
      memory: "2048",
      instanceRoleArn: appRunnerInstanceRole.arn,
    },
    tags: commonTags,
  },
  {
    dependsOn: [appRunnerInstanceAccess],
    replaceOnChanges: ["sourceConfiguration.imageRepository.imageRepositoryType"],
  },
);

export const apiBaseUrl = appRunnerService.serviceUrl;
export const appRunnerImage = appRunnerService.sourceConfiguration.apply(
  (sc) => sc.imageRepository?.imageIdentifier,
);

// Build CloudFront distribution with two origins: S3 and App Runner
// Using a placeholder domain initially if the service URL isn't ready,
// but App Runner serviceUrl is available as soon as the resource object is created in Pulumi.
const apiDomain = appRunnerService.serviceUrl.apply((u: string) => {
  if (!u) return "placeholder.apprunner.aws"; // CloudFront requires a non-empty domain
  try {
    return new URL(u).host;
  } catch {
    return u; // Fallback if it's already just a hostname
  }
});

const cfDistribution = new aws.cloudfront.Distribution("mirror-ball-Cdn", {
  enabled: true,
  comment: pulumi.interpolate`mirror-ball cdn (${pulumi.getStack()})`,
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
        httpPort: 80,
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
const bucketPolicy = new aws.s3.BucketPolicy("mirror-ball-BucketPolicy", {
  bucket: bucket.bucket,
  policy: pulumi.all([bucket.arn, cfDistribution.arn]).apply(([bArn, distArn]) =>
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
