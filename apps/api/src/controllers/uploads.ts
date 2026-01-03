import { z } from "zod";
import {
  PresignUploadInput,
  PresignUploadOutput,
  ConfirmUploadInput,
} from "@mirror-ball/shared-schemas/api.ts";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";
import { s3, doc } from "../lib/aws.ts";
import { BUCKET_NAME, TABLE_NAME, REGION, CLOUDFRONT_DOMAIN } from "../lib/config.ts";
import { json, error } from "../lib/responses.ts";
import { authenticate, requireRole, emailAllowed } from "../middleware/auth.ts";

export async function presignUpload(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { claims, groups } = auth;

  if (!(requireRole(groups, "dev") || requireRole(groups, "admin"))) return error(403, "Forbidden");
  if (!emailAllowed(claims.email)) return error(403, "Uploads restricted to company domain");

  const body = await req.json().catch(() => ({}));
  const parsed = PresignUploadInput.safeParse(body);
  if (!parsed.success) return error(400, "Invalid body", parsed.error.issues);
  const { contentType, fileName, title, dimensions, fileSize } = parsed.data;

  if (!BUCKET_NAME) return error(500, "BUCKET_NAME not configured");
  if (!TABLE_NAME) return error(500, "TABLE_NAME not configured");

  // Check for title uniqueness using GSI
  const existing = await doc.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "TitleIndex",
      KeyConditionExpression: "title = :t",
      ExpressionAttributeValues: { ":t": title },
      Limit: 1,
    }),
  );

  if (existing.Items && existing.Items.length > 0) {
    return error(
      400,
      `An image with the title "${title}" already exists. Please choose a unique title.`,
    );
  }

  const sanitizedTitle = title.replace(/\s+/g, "-");
  const imageId = ulid();
  const owner = (claims["cognito:username"] as string) || (claims.email ?? "unknown");
  const key = `images/${owner}/${imageId}/${fileName}`;

  // Pre-sign PUT URL
  const put = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, put, { expiresIn: 900 });

  // Compute public URL via CloudFront if available; otherwise S3 virtual-hosted style
  const cf = CLOUDFRONT_DOMAIN
    ? `https://${CLOUDFRONT_DOMAIN}/${key}`
    : `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;

  const now = new Date().toISOString();
  // Write stub item (pending)
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        imageId,
        owner,
        title: sanitizedTitle,
        originalFileName: fileName,
        dimensions,
        fileSize,
        devName: owner,
        uploadTime: now,
        s3Key: key,
        publicUrl: cf,
        status: "pending",
      },
      ConditionExpression: "attribute_not_exists(imageId)",
    }),
  );

  const out: z.infer<typeof PresignUploadOutput> = {
    uploadUrl,
    objectKey: key,
    publicUrl: cf,
    imageId,
  };
  return json(out);
}

export async function confirmUpload(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { claims, groups } = auth;

  if (!(requireRole(groups, "dev") || requireRole(groups, "admin"))) return error(403, "Forbidden");
  if (!emailAllowed(claims.email)) return error(403, "Uploads restricted to company domain");

  const body = await req.json().catch(() => ({}));
  const parsed = ConfirmUploadInput.safeParse(body);
  if (!parsed.success) return error(400, "Invalid body", parsed.error.issues);
  const { imageId } = parsed.data;

  if (!TABLE_NAME) return error(500, "TABLE_NAME not configured");

  await doc.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { imageId },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "complete" },
      ConditionExpression: "attribute_exists(imageId)",
    }),
  );
  return json({ ok: true });
}
