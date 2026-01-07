import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { AppConfig, defaultAppConfig } from "@mirror-ball/shared-schemas/config";
import { doc } from "./aws.ts";
import { CONFIG_TABLE_NAME } from "./config.ts";

const CONFIG_PK = "GLOBAL";

// Simple in-memory cache
let cachedConfig: AppConfig = defaultAppConfig;
let lastFetchTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

// Resets the in-memory configuration cache to force a fresh fetch from DynamoDB.
export function clearConfigCache() {
  console.log("[config-service] Clearing cache");
  cachedConfig = defaultAppConfig;
  lastFetchTime = 0;
}

// Retrieves the full application configuration from DynamoDB, with in-memory caching and
// auto-initialization.
export async function fetchFullConfig(): Promise<AppConfig> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL && lastFetchTime !== 0) {
    return cachedConfig;
  }

  if (!CONFIG_TABLE_NAME) {
    console.error("[config-service] CONFIG_TABLE_NAME not set");
    return defaultAppConfig;
  }

  console.log(`[config-service] Fetching from DDB: ${CONFIG_TABLE_NAME}`);

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
      lastFetchTime = now;
    } else {
      console.log("[config-service] No config found, initializing...");
      cachedConfig = defaultAppConfig;
      // We don't set lastFetchTime here, so the next call will try to fetch (and potentially initialize) again.
      // This is safer in case the PutCommand below fails or if another instance is also initializing.
      lastFetchTime = 0;

      // Persist the default config
      try {
        await doc.send(
          new PutCommand({
            TableName: CONFIG_TABLE_NAME,
            Item: {
              configKey: CONFIG_PK,
              ...defaultAppConfig,
              updatedAt: new Date().toISOString(),
            },
          }),
        );
        console.log("[config-service] Successfully initialized default config");
      } catch (putErr) {
        console.error("[config-service] Failed to initialize default config:", putErr);
      }
    }
    return cachedConfig;
  } catch (err) {
    console.error("[config-service] Failed to fetch app config:", err);
    return cachedConfig || defaultAppConfig;
  }
}

// Returns the user restriction string (e.g., email domain) from the configuration.
export async function fetchUserRestriction(): Promise<string> {
  const config = await fetchFullConfig();
  return config?.userRestriction || "";
}
