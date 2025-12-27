// Bun HTTP service implementing minimal API per plan
import { z } from "zod";
import {
  PresignUploadInput,
  PresignUploadOutput,
  ConfirmUploadInput,
} from "@mirrorball/shared-schemas/api.ts";
import { ImageSchema } from "@mirrorball/shared-schemas/image.ts";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";
import * as jose from "jose";

const PORT = Number(process.env.PORT ?? 8080);
const REGION = process.env.AWS_REGION ?? "us-west-2";
const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
const TABLE_NAME = process.env.TABLE_NAME ?? "";
const USER_POOL_ID = process.env.USER_POOL_ID ?? "";
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const s3 = new S3Client({ region: REGION });
const ddb = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(ddb);

// JWKS for Cognito
const jwksUri = USER_POOL_ID
  ? `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
  : undefined;
const jwks = jwksUri ? jose.createRemoteJWKSet(new URL(jwksUri)) : undefined;

type Claims = { email?: string; [k: string]: any };

function error(status: number, message: string, details?: unknown) {
  return json({ error: message, details }, { status });
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function notFound() {
  return error(404, "Not Found");
}

async function authenticate(
  req: Request,
): Promise<{ claims: Claims; groups: string[] } | Response> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return error(401, "Missing Bearer token");
  const token = auth.slice("Bearer ".length);
  if (!jwks) return error(500, "Auth not configured");
  try {
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    });
    const groups = Array.isArray(payload["cognito:groups"])
      ? (payload["cognito:groups"] as string[])
      : [];
    return { claims: payload as Claims, groups };
  } catch (e) {
    return error(401, "Invalid token", String(e));
  }
}

function requireRole(groups: string[], role: "dev" | "admin") {
  return groups.includes(role);
}

function emailAllowed(email?: string): boolean {
  if (!ALLOWED_EMAIL_DOMAINS.length) return true; // unrestricted if unset
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

console.log(`API listening on http://localhost:${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && (path === "/" || path === "/api/health")) {
      return json({ ok: true });
    }

    // POST /api/presign-upload
    if (req.method === "POST" && path === "/api/presign-upload") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      const { claims, groups } = auth;
      if (!(requireRole(groups, "dev") || requireRole(groups, "admin")))
        return error(403, "Forbidden");
      if (!emailAllowed(claims.email)) return error(403, "Uploads restricted to company domain");

      const body = await req.json().catch(() => ({}));
      const parsed = PresignUploadInput.safeParse(body);
      if (!parsed.success) return error(400, "Invalid body", parsed.error.issues);
      const { contentType, fileName, devName } = parsed.data;

      if (!BUCKET_NAME) return error(500, "BUCKET_NAME not configured");
      if (!TABLE_NAME) return error(500, "TABLE_NAME not configured");

      const imageId = ulid();
      const owner = (claims["cognito:username"] as string) || (claims.email ?? "unknown");
      const key = `images/${owner}/${imageId}/${fileName}`;

      // Pre-sign PUT URL
      const put = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType });
      const uploadUrl = await getSignedUrl(s3, put, { expiresIn: 900 });

      // Compute public URL via CloudFront if available; otherwise S3 virtual-hosted style
      const cf = process.env.CLOUDFRONT_DOMAIN
        ? `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`
        : `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;

      const now = new Date().toISOString();
      // Write stub item (pending)
      await doc.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            imageId,
            owner,
            devName,
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

    // POST /api/confirm-upload
    if (req.method === "POST" && path === "/api/confirm-upload") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      const { claims, groups } = auth;
      if (!(requireRole(groups, "dev") || requireRole(groups, "admin")))
        return error(403, "Forbidden");
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

    // GET /api/images (simple scan with optional owner/devName prefix filtering for MVP)
    if (req.method === "GET" && path === "/api/images") {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      const { searchParams } = new URL(req.url);
      const owner = searchParams.get("owner") ?? undefined;
      const devName = searchParams.get("devName") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
      const data = await doc.send(new ScanCommand({ TableName: TABLE_NAME, Limit: limit }));
      const items = (data.Items ?? []).filter(
        (it: any) =>
          (owner ? it.owner === owner : true) && (devName ? it.devName === devName : true),
      );
      const parsed = z.array(ImageSchema).safeParse(
        items.map((i: any) => ({
          imageId: i.imageId,
          owner: i.owner,
          devName: i.devName,
          uploadTime: i.uploadTime,
          s3Key: i.s3Key,
          publicUrl: i.publicUrl,
        })),
      );
      if (!parsed.success) return error(500, "Corrupt data", parsed.error.issues);
      return json({ items: parsed.data, cursor: null });
    }

    // DELETE /api/images/:imageId
    if (req.method === "DELETE" && path.startsWith("/api/images/")) {
      const auth = await authenticate(req);
      if (auth instanceof Response) return auth;
      const { claims, groups } = auth;
      if (!requireRole(groups, "admin")) return error(403, "Admin only");
      if (!emailAllowed(claims.email)) return error(403, "Uploads restricted to company domain");
      const imageId = path.split("/").pop()!;
      // Fetch item to get s3Key
      const data = await doc.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          Limit: 1,
          FilterExpression: "imageId = :id",
          ExpressionAttributeValues: { ":id": imageId },
        }),
      );
      const item = (data.Items ?? [])[0];
      if (!item) return notFound();
      const key = item.s3Key as string;
      // Delete S3 object and DDB item
      if (BUCKET_NAME && key) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
      }
      await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { imageId } }));
      return json({ ok: true });
    }

    return notFound();
  },
});
