import { AppError } from "./errors";

/**
 * In-process token bucket. Good for a single web instance; swap for a Redis/Postgres-backed
 * limiter when running several instances (same interface).
 */
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, updated: now };
  const refill = ((now - b.updated) / windowMs) * limit;
  b.tokens = Math.min(limit, b.tokens + refill);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new AppError("Too many requests. Please wait a moment and try again.", "RATE_LIMITED");
  }
  b.tokens -= 1;
  buckets.set(key, b);
}
