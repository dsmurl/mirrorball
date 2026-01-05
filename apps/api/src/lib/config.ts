export const PORT = Number(process.env.PORT ?? 8080);
export const REGION = process.env.AWS_REGION ?? "us-west-2";
export const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
export const IMAGE_TABLE_NAME = process.env.IMAGE_TABLE_NAME ?? "";
export const CONFIG_TABLE_NAME = process.env.CONFIG_TABLE_NAME ?? "";
export const USER_POOL_ID = process.env.USER_POOL_ID ?? "";
export const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
