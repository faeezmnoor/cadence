/**
 * Per-user fixed-window rate limiter (security HIGH #2).
 *
 * Single Postgres round-trip. The CTE upserts into `rate_limits` keyed by
 * (user_id, scope):
 *   - If no row exists, insert with count=1, window_start=now().
 *   - If the existing row's window is stale (>= windowSeconds old), reset
 *     to count=1, window_start=now().
 *   - Otherwise increment count by 1.
 * The RETURNING clause hands back the post-update count and the (possibly
 * just-reset) window_start so the caller can compute Retry-After.
 *
 * Atomicity comes from Postgres's row-level locking on the UPSERT — no
 * read-modify-write race between concurrent requests for the same user.
 *
 * Why not a token bucket: the spec asks for "5 turns per minute". A fixed
 * window matches the spec literally, is one row, and survives multi-instance
 * cold starts without warmup. Drift at window boundaries (a user could
 * theoretically get 10 in ~120ms by straddling the boundary) is acceptable
 * — the goal is bounding LLM cost runaway, not perfect fairness.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

export interface RateLimitResult {
  allowed: boolean;
  /** Current count in the active window (after this request). */
  count: number;
  /** Limit for this scope. */
  limit: number;
  /** Seconds until the active window expires (>= 0). */
  retryAfter: number;
}

export interface RateLimitOptions {
  userId: string;
  scope: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit({
  userId,
  scope,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  // The upsert: increment if same window, otherwise reset.
  const rows = await db.execute<{
    count: number;
    window_start: Date;
  }>(sql`
    INSERT INTO rate_limits (user_id, scope, count, window_start, updated_at)
    VALUES (${userId}::uuid, ${scope}, 1, now(), now())
    ON CONFLICT (user_id, scope) DO UPDATE
      SET count = CASE
            WHEN rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval
              THEN 1
            ELSE rate_limits.count + 1
          END,
          window_start = CASE
            WHEN rate_limits.window_start < now() - (${windowSeconds} || ' seconds')::interval
              THEN now()
            ELSE rate_limits.window_start
          END,
          updated_at = now()
    RETURNING count, window_start
  `);

  const row = (rows as unknown as Array<{ count: number; window_start: Date }>)[0];
  if (!row) {
    // Should be impossible (INSERT … RETURNING always returns); fail-open
    // so a malformed driver response doesn't 429 a real user.
    return { allowed: true, count: 0, limit, retryAfter: 0 };
  }

  const windowStartMs = new Date(row.window_start).getTime();
  const elapsed = Math.max(0, (Date.now() - windowStartMs) / 1000);
  const retryAfter = Math.max(0, Math.ceil(windowSeconds - elapsed));

  return {
    allowed: row.count <= limit,
    count: row.count,
    limit,
    retryAfter,
  };
}
