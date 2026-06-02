/**
 * MUST-SHIP #12 — pure streak computation, exported for test isolation.
 *
 * Walks rows newest-first and counts consecutive `delivered`. In-flight
 * rows (`pending` / `composing`) are skipped (they haven't failed yet,
 * so they don't reset the streak). Anything else terminates the count
 * and is reported as the most recent "break".
 *
 * Kept dependency-free so we can unit-test without spinning up Drizzle.
 */
export interface StreakRow {
  status: string;
  lastError: string | null;
  createdAt: Date;
}

export interface StreakResult {
  streak: number;
  lastBreakAt: Date | null;
  lastBreakStatus: string | null;
  lastBreakError: string | null;
  inFlightSkipped: number;
}

export function computeStreak(rows: StreakRow[]): StreakResult {
  let streak = 0;
  let lastBreakAt: Date | null = null;
  let lastBreakStatus: string | null = null;
  let lastBreakError: string | null = null;
  let inFlightSkipped = 0;
  for (const r of rows) {
    if (r.status === "delivered") {
      streak += 1;
      continue;
    }
    if (r.status === "pending" || r.status === "composing") {
      inFlightSkipped += 1;
      continue;
    }
    lastBreakAt = r.createdAt;
    lastBreakStatus = r.status;
    lastBreakError = r.lastError;
    break;
  }
  return { streak, lastBreakAt, lastBreakStatus, lastBreakError, inFlightSkipped };
}
