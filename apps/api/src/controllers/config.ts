import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { AppConfigSchema } from "@mirror-ball/shared-schemas/config";

import { doc } from "../lib/aws.ts";
import { CONFIG_TABLE_NAME } from "../lib/config.ts";
import { fetchFullConfig, clearConfigCache } from "../lib/config-service.ts";
import { json, error } from "../lib/responses.ts";
import { authenticate, requireRole } from "../middleware/auth.ts";

const CONFIG_PK = "GLOBAL";

export async function setConfig(req: Request) {
  console.log("[config-controller] setConfig called");
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { groups } = auth;

  if (!requireRole(groups, "admin")) {
    console.log("[config-controller] 403: User not admin");
    return error(403, "Admin only");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = AppConfigSchema.safeParse(body);

  if (!parsed.success) {
    console.log("[config-controller] 400: Invalid config data", parsed.error.issues);
    return error(400, "Invalid configuration data", parsed.error.issues);
  }

  if (!CONFIG_TABLE_NAME) return error(500, "CONFIG_TABLE_NAME not configured");

  try {
    await doc.send(
      new PutCommand({
        TableName: CONFIG_TABLE_NAME,
        Item: {
          configKey: CONFIG_PK,
          ...parsed.data,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    console.log("[config-controller] Successfully updated config in DDB");
  } catch (err) {
    console.error("[config-controller] Failed to update config in DDB:", err);
    return error(500, "Failed to update configuration");
  }

  // Clear local cache
  clearConfigCache();

  return json({ ok: true, config: parsed.data });
}

export async function getConfig(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) {
    console.log("[config-controller] Auth failed in getConfig");
    return auth;
  }
  const { claims } = auth;

  const config = await fetchFullConfig();
  const userRestriction = config?.userRestriction || "";

  // Calculate isRestricted based on the current user's email
  const isRestricted = !!(
    userRestriction &&
    (!claims.email || !claims.email.toLowerCase().includes(userRestriction.toLowerCase()))
  );

  return json({
    ...config,
    userRestriction,
    isRestricted,
  });
}
