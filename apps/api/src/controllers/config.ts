import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { AppConfig, AppConfigSchema, defaultAppConfig } from "@mirror-ball/shared-schemas/config";

import { doc } from "../lib/aws.ts";
import { CONFIG_TABLE_NAME } from "../lib/config.ts";
import { json, error } from "../lib/responses.ts";
import { authenticate, requireRole } from "../middleware/auth.ts";

const CONFIG_PK = "GLOBAL";

export async function setConfig(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { groups } = auth;

  if (!requireRole(groups, "admin")) return error(403, "Admin only");

  const body = await req.json().catch(() => ({}));
  const parsed = AppConfigSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "Invalid configuration data", parsed.error.issues);
  }

  if (!CONFIG_TABLE_NAME) return error(500, "CONFIG_TABLE_NAME not configured");

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

  // Clear local cache
  clearConfigCache();

  return json({ ok: true, config: parsed.data });
}

export async function getConfig(req: Request) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { claims } = auth;

  const config = await fetchFullConfig();
  const userRestriction = config?.userRestriction || "";

  // Calculate isRestricted based on current user's email
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

// Simple in-memory cache
let cachedConfig: AppConfig = defaultAppConfig;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

export function clearConfigCache() {
  cachedConfig = defaultAppConfig;
  lastFetchTime = 0;
}

export async function fetchFullConfig() {
  const now = Date.now();
  if (cachedConfig !== null && now - lastFetchTime < CACHE_TTL) {
    return cachedConfig;
  }

  if (!CONFIG_TABLE_NAME) return null;

  try {
    const res = await doc.send(
      new GetCommand({
        TableName: CONFIG_TABLE_NAME,
        Key: { configKey: CONFIG_PK },
      }),
    );

    if (res.Item) {
      const { configKey, updatedAt, ...config } = res.Item;
      cachedConfig = config as AppConfig;
    } else {
      cachedConfig = defaultAppConfig;
    }

    lastFetchTime = now;
    return cachedConfig;
  } catch (err) {
    console.error("Failed to fetch app config:", err);
    return cachedConfig;
  }
}

export async function fetchUserRestriction(): Promise<string | null> {
  const config = await fetchFullConfig();
  return config?.userRestriction || "";
}
