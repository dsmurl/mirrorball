import * as pulumi from "@pulumi/pulumi";

// Placeholder Pulumi program skeleton. Subsequent iterations will add real resources per plan.
const config = new pulumi.Config();
const region = config.get("region") ?? "us-west-2";
const allowedEmailDomains = config.getObject<string[]>("allowedEmailDomains") ?? [];

// Planned outputs (placeholder values until resources are created)
export const deploymentRegion = region;
export const cloudFrontDomainName = pulumi.output("<pending>");
export const bucketName = pulumi.output("<pending>");
export const userPoolId = pulumi.output("<pending>");
export const userPoolClientId = pulumi.output("<pending>");
export const apiBaseUrl = pulumi.output("<pending>");
export const tableName = pulumi.output("<pending>");
export const allowedDomains = pulumi.output(allowedEmailDomains);
