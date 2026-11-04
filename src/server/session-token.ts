import { createHash, randomBytes } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
