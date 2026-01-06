import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as dotenv from "dotenv";

// Load environment variables from .env if it exists
dotenv.config();

// Config
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

// Project Prefix for naming resources
const projectNameEnv = process.env.PROJECT_NAME;
const projectName = projectNameEnv ? `mirror-ball-${projectNameEnv}` : "mirror-ball";
const stackName = pulumi.getStack();
const prefix = `${projectName}-${stackName}`;

const commonTags = {
  project: projectName,
  managedBy: "pulumi",
  environment: stackName,
};
const imageTag = config.get("imageTag") ?? "dev-current"; // CI sets this to github.sha in Stage 2

// 1) S3 bucket (private) with prefixes for site/ and images/
const bucket = new aws.s3.Bucket(`${prefix}-Bucket`, {
  bucketPrefix: `${projectName}-`,
  forceDestroy: true,
  tags: commonTags,
});

// Add CORS configuration to the bucket to allow pre-signed uploads from the web app
const bucketCors = new aws.s3.BucketCorsConfiguration(`${prefix}-BucketCors`, {
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
const bucketPublicAccess = new aws.s3.BucketPublicAccessBlock(`${prefix}-BucketPab`, {
  bucket: bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// 2) DynamoDB tables (on-demand)
const imagesTable = new aws.dynamodb.Table(`${prefix}-ImagesTable`, {
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

const configTable = new aws.dynamodb.Table(`${prefix}-ConfigTable`, {
  attributes: [{ name: "configKey", type: "S" }],
  hashKey: "configKey",
  billingMode: "PAY_PER_REQUEST",
  tags: commonTags,
});

// 3) Cognito User Pool and App Client (Hosted UI domain added)
const userPool = new aws.cognito.UserPool(`${prefix}-UserPool`, {
  schemas: [{ attributeDataType: "String", name: "email", required: true, mutable: true }],
  autoVerifiedAttributes: ["email"],
  adminCreateUserConfig: {
    allowAdminCreateUserOnly: false,
  },
  tags: commonTags,
});

const accountId = aws.getCallerIdentity().then((id) => id.accountId);

const userPoolDomainResource = new aws.cognito.UserPoolDomain(`${prefix}-UserPoolDomain`, {
  domain: pulumi.interpolate`${projectName}-${stackName}-${accountId}`,
  userPoolId: userPool.id,
});

// User groups: dev and admin
const devGroup = new aws.cognito.UserGroup(`${prefix}-DevGroup`, {
  userPoolId: userPool.id,
  name: "dev",
  precedence: 10,
});

const adminGroup = new aws.cognito.UserGroup(`${prefix}-AdminGroup`, {
  userPoolId: userPool.id,
  name: "admin",
  precedence: 5,
});

// 4) ECR repository for API images
const ecrRepo = new aws.ecr.Repository(`${prefix}-ApiRepository`, {
  name: prefix,
  imageScanningConfiguration: { scanOnPush: true },
  tags: commonTags,
});

// Outputs
export const deploymentRegion = region;
export const imageBucketName = bucket.bucket;
export const imagesTableName = imagesTable.name;
export const configTableName = configTable.name;
export const userPoolId = userPool.id;
export const userPoolDomain = userPoolDomainResource.domain.apply(
  (d) => `https://${d}.auth.${region}.amazoncognito.com`,
);
export const ecrRepositoryUri = ecrRepo.repositoryUrl;
// Placeholder (set after distribution is created below)
// export const cloudFrontDomainName = pulumi.output("<pending>");
// 6) App Runner service (Stage 1 skeleton) — image tag will be updated by CI in Stage 2

// IAM role for App Runner to pull from ECR
const appRunnerAccessRole = new aws.iam.Role(`${prefix}-AppRunnerAccessRole`, {
  name: `${prefix}-apprunner-access`,
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
  `${prefix}-AppRunnerAccessAttachment`,
  {
    role: appRunnerAccessRole.name,
    policyArn: aws.iam.ManagedPolicy.AmazonEC2ContainerRegistryReadOnly,
  },
);

const appRunnerLogsPolicy = new aws.iam.RolePolicy(`${prefix}-AppRunnerLogsPolicy`, {
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
const appRunnerInstanceRole = new aws.iam.Role(`${prefix}-AppRunnerInstanceRole`, {
  name: `${prefix}-apprunner-instance`,
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

const appRunnerInstanceAccess = new aws.iam.RolePolicy(`${prefix}-AppRunnerInstanceAccess`, {
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
const oac = new aws.cloudfront.OriginAccessControl(`${prefix}-Oac`, {
  name: `${prefix}-oac`,
  description: `OAC for S3 origin (${projectName})`,
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

// 6) App Runner service
const forceUsePublicImageEnv = process.env.FORCE_USE_PUBLIC_IMAGE;
console.log(`[infra] process.env.FORCE_USE_PUBLIC_IMAGE: "${forceUsePublicImageEnv}"`);

// Check if the ECR repository is initialized (has at least the 'dev-current' tag)
// This is used to auto-switch from Skeleton Mode (Nginx) to ECR Mode.
const imageExists = ecrRepo.name.apply(async (repoName) => {
  const tag = "dev-current";
  console.log(`[infra] imageExists check starting for ${repoName}:${tag}`);
  try {
    const img = await aws.ecr.getImage({
      repositoryName: repoName,
      imageTag: tag,
    });
    const exists = !!img.imageDigest;
    console.log(
      `[infra] imageExists result: ${repoName}:${tag} -> exists: ${exists}, digest: ${img.imageDigest}`,
    );
    return exists;
  } catch (err: any) {
    // If it's a RepositoryNotFoundException or ImageNotFoundException, it's expected for skeleton mode
    console.log(
      `[infra] dev-current image not found during imageExists() for ${repoName}:${tag}: ${err.message || err}`,
    );
    return false;
  }
});

// Logic: Use environment variable if provided, otherwise auto-detect based on ECR image existence.
const usePublicImage =
  forceUsePublicImageEnv !== undefined
    ? forceUsePublicImageEnv !== "false"
    : imageExists.apply((exists) => !exists);

pulumi.all([forceUsePublicImageEnv, usePublicImage, imageTag]).apply(([env, use, tag]) => {
  console.log(
    `[infra] Image selection: FORCE_USE_PUBLIC_IMAGE=${env}, final usePublicImage=${use}, imageTag=${tag}`,
  );
});

const imageConfiguration: aws.types.input.apprunner.ServiceSourceConfigurationImageRepositoryImageConfiguration =
  {
    port: "8080",
    runtimeEnvironmentVariables: {
      AWS_REGION: region,
      BUCKET_NAME: bucket.bucket,
      IMAGE_TABLE_NAME: imagesTable.name,
      CONFIG_TABLE_NAME: configTable.name,
      USER_POOL_ID: userPool.id,
    },
  };

const sourceConfiguration = pulumi
  .all([usePublicImage, ecrRepo.repositoryUrl, imageTag, appRunnerAccessRole.arn])
  .apply(
    ([usePublic, repoUrl, tag, roleArn]): aws.types.input.apprunner.ServiceSourceConfiguration => {
      if (usePublic) {
        return {
          imageRepository: {
            imageIdentifier: "public.ecr.aws/nginx/nginx:latest",
            imageRepositoryType: "ECR_PUBLIC",
            imageConfiguration: { port: "80" },
          },
          autoDeploymentsEnabled: false,
        };
      } else {
        return {
          authenticationConfiguration: { accessRoleArn: roleArn },
          imageRepository: {
            imageRepositoryType: "ECR",
            imageIdentifier: `${repoUrl}:${tag}`,
            imageConfiguration: imageConfiguration,
          },
          autoDeploymentsEnabled: true,
        };
      }
    },
  );

const appRunnerService = new aws.apprunner.Service(
  `${prefix}-ApiService`,
  {
    serviceName: prefix,
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
    deleteBeforeReplace: true,
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

const cfDistribution = new aws.cloudfront.Distribution(`${prefix}-Cdn`, {
  enabled: true,
  comment: `${prefix} cdn`,
  origins: [
    {
      originId: "site-origin",
      domainName: bucket.bucketRegionalDomainName,
      originAccessControlId: oac.id,
      originPath: "/site",
    },
    {
      originId: "images-origin",
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
    targetOriginId: "site-origin",
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
      forwardedValues: {
        queryString: true,
        cookies: { forward: "all" },
        headers: [
          "Authorization",
          "Origin",
          "Access-Control-Request-Method",
          "Access-Control-Request-Headers",
        ],
      },
      minTtl: 0,
      defaultTtl: 0,
      maxTtl: 0,
    },
    {
      pathPattern: "/images/*",
      targetOriginId: "images-origin",
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
const bucketPolicy = new aws.s3.BucketPolicy(`${prefix}-BucketPolicy`, {
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

const userPoolClient = new aws.cognito.UserPoolClient(`${prefix}-UserPoolClient`, {
  userPoolId: userPool.id,
  generateSecret: false,
  allowedOauthFlows: ["code", "implicit"],
  allowedOauthFlowsUserPoolClient: true,
  allowedOauthScopes: ["email", "openid", "profile"],
  callbackUrls: [
    "http://localhost:5173/",
    pulumi.interpolate`https://${cfDistribution.domainName}/`,
  ],
  logoutUrls: ["http://localhost:5173/", pulumi.interpolate`https://${cfDistribution.domainName}/`],
  supportedIdentityProviders: ["COGNITO"],
  preventUserExistenceErrors: "ENABLED",
});

export const userPoolClientId = userPoolClient.id;
