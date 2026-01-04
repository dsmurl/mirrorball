import { z } from "zod";
import { ImageSchema } from "@mirror-ball/shared-schemas/image";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { s3, doc } from "../lib/aws.ts";
import { BUCKET_NAME, IMAGE_TABLE_NAME } from "../lib/config.ts";
import { json, error, notFound } from "../lib/responses.ts";
import { authenticate, requireRole, emailAllowed } from "../middleware/auth.ts";

export async function listImages(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner") ?? undefined;
  const devName = searchParams.get("devName") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const data = await doc.send(new ScanCommand({ TableName: IMAGE_TABLE_NAME, Limit: limit }));
  const items = (data.Items ?? []).filter(
    (it: any) => (owner ? it.owner === owner : true) && (devName ? it.devName === devName : true),
  );

  const parsed = z.array(ImageSchema).safeParse(
    items.map((i: any) => ({
      imageId: i.imageId,
      owner: i.owner,
      title: i.title || "Untitled",
      originalFileName: i.originalFileName || "unknown",
      dimensions: i.dimensions,
      fileSize: i.fileSize,
      devName: i.devName,
      uploadTime: i.uploadTime,
      s3Key: i.s3Key,
      publicUrl: i.publicUrl,
      status: i.status,
    })),
  );

  if (!parsed.success) return error(500, "Corrupt data", parsed.error.issues);
  return json({ items: parsed.data, cursor: null });
}

export async function deleteImage(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { claims, groups } = auth;

  if (!requireRole(groups, "admin")) return error(403, "Admin only");
  if (!emailAllowed(claims.email)) return error(403, "Uploads restricted to company domain");

  const url = new URL(req.url);
  const imageId = url.pathname.split("/").pop()!;

  // Fetch item to get s3Key
  const data = await doc.send(
    new ScanCommand({
      TableName: IMAGE_TABLE_NAME,
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
  await doc.send(new DeleteCommand({ TableName: IMAGE_TABLE_NAME, Key: { imageId } }));

  return json({ ok: true });
}
