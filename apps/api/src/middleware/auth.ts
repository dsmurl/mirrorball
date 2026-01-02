import * as jose from "jose";
import { AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { REGION, USER_POOL_ID, ALLOWED_EMAIL_DOMAINS } from "../lib/config.ts";
import { error } from "../lib/responses.ts";
import { cognito } from "../lib/aws.ts";

// JWKS for Cognito
const jwksUri = USER_POOL_ID
  ? `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
  : undefined;
const jwks = jwksUri ? jose.createRemoteJWKSet(new URL(jwksUri)) : undefined;

export type Claims = { email?: string; [k: string]: any };

export async function authenticate(
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
    let groups = Array.isArray(payload["cognito:groups"])
      ? (payload["cognito:groups"] as string[])
      : [];

    // Auto-assign "dev" group if the user has no groups
    if (groups.length === 0 && USER_POOL_ID) {
      const username = (payload["cognito:username"] as string) || (payload.sub as string);
      console.log(`Auto-assigning 'dev' group to user: ${username}`);
      try {
        await cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            GroupName: "dev",
          }),
        );
        // Add "dev" to the local groups list so the current request can proceed
        groups = ["dev"];
      } catch (err) {
        console.error("Failed to auto-assign group:", err);
        // We don't block the request if this fails,
        // but the user won't have permissions for this specific call.
      }
    }

    return { claims: payload as Claims, groups };
  } catch (e) {
    return error(401, "Invalid token", String(e));
  }
}

export function requireRole(groups: string[], role: "dev" | "admin") {
  return groups.includes(role);
}

export function emailAllowed(email?: string): boolean {
  if (!ALLOWED_EMAIL_DOMAINS.length) return true; // unrestricted if unset
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}
