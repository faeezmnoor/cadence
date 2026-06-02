/**
 * T-407 (CAD-48): feedback loop evaluation harness.
 *
 * Computes per-user, per-window health + signal-quality metrics over
 * the rolling 7-day window ending at `windowEnd`. The result is UPSERTed
 * into `feedback_eval_runs` keyed on (user_id, window_end_date).
 *
 * Why this exists:
 *   Phase 4 shipped a four-component feedback loop —
 *     1) inline keyboard (T-401/T-402)
 *     2) /tune freeform command (T-403)
 *     3) composer injection (T-404)
 *     4) distill loop (T-405)
 *   — but until now we had no aggregate visibility on whether the loop
 *   is actually doing anything. The smoke summary (T-306) tells us the
 *   delivery layer works; this tells us the *learning* layer works.
 *
 * Design constraints:
 *   - Pure compute function (`computeFeedbackEval`) decoupled from db
 *     writes so the test suite can drive it from fixtures.
 *   - Nullable rates (engagement, positive) when their denominator is
 *     zero — avoid 0/0 lying as "0% engagement". The admin viewer
 *     surfaces nulls as em-dashes.
 *   - Two metric layers:
 *       activity (briefs_delivered, taps, tune_commands)
 *       signal quality (engagement_rate, positive_rate, distilled_present)
 *
 * Window:
 *   7 rolling days ending at `windowEnd`. `window_end_date` is the
 *   calendar date in UTC (the cron triggers at 01:30 UTC = 09:30 MYT,
 *   so the local calendar day at trigger time is already locked in).
 */
import { and, count, desc, eq, gte, isNotNull, max, sql } from "drizzle-orm";
import { db as defaultDb } from "@/server/db/client";
import {
  digestRuns,
  feedbackEvalRuns,
  feedbackEvents,
  learningLog,
  users,
} from "@/server/db/schema";

export const DEFAULT_WINDOW_DAYS = 7;

export interface FeedbackEvalInput {
  /** Brief rows delivered in-window, with status='delivered'. */
  briefs: Array<{ id: string; updatedAt: Date | null; createdAt: Date }>;
  /** All feedback_events for this user in-window, regardless of source. */
  feedbackEvents: Array<{
    vote: string | null;
    signalType: string | null;
    source: string;
    createdAt: Date;
  }>;
  /** learning_log rows with source='tune_command' in-window. */
  tuneCommands: Array<{ createdAt: Date }>;
  /** users.distilled_prefs — null/empty means no distill has produced anything yet. */
  distilledPrefs: unknown | null;
}

export interface FeedbackEvalMetrics {
  briefsDeliveredCount: number;
  keyboardTapsCount: number;
  /** taps / briefs, 0..1; null when briefs == 0 */
  engagementRate: number | null;
  /** (up + love) / total taps, 0..1; null when taps == 0 */
  positiveRate: number | null;
  tuneCommandsCount: number;
  distilledPrefsPresent: boolean;
  lastBriefAt: Date | null;
  lastTapAt: Date | null;
}

/**
 * Pure metric computation. Exported so tests can drive it from fixtures
 * without any db at all.
 *
 * `keyboardTapsCount` only counts feedback_events whose source is the
 * inline keyboard. Tune commands are tracked separately — folding them
 * into the same denominator would conflate two different intent levels.
 *
 * `positiveRate` denominator is `keyboardTapsCount` (taps only). vote
 * values: up | love -> positive; down | skip -> non-positive. Unknown
 * votes (legacy free_text rows where vote is null) are excluded from
 * the denominator so they don't poison the ratio.
 */
export function computeFeedbackEval(input: FeedbackEvalInput): FeedbackEvalMetrics {
  const briefsDeliveredCount = input.briefs.length;

  const keyboardEvents = input.feedbackEvents.filter(
    (e) => e.source === "inline_keyboard"
  );
  const keyboardTapsCount = keyboardEvents.length;

  const engagementRate =
    briefsDeliveredCount === 0
      ? null
      : clampRate(keyboardTapsCount / briefsDeliveredCount);

  let positiveRate: number | null = null;
  if (keyboardTapsCount > 0) {
    const positiveVotes = keyboardEvents.filter(
      (e) => e.vote === "up" || e.vote === "love"
    ).length;
    // votes that aren't in {up, love, down, skip} we still count in the
    // denominator — they're explicit taps, just unknown polarity.
    positiveRate = clampRate(positiveVotes / keyboardTapsCount);
  }

  const tuneCommandsCount = input.tuneCommands.length;

  const distilledPrefsPresent =
    input.distilledPrefs !== null &&
    input.distilledPrefs !== undefined &&
    !isEmptyDistill(input.distilledPrefs);

  const lastBriefAt =
    input.briefs.length === 0
      ? null
      : input.briefs.reduce<Date | null>((acc, b) => {
          const t = b.updatedAt ?? b.createdAt;
          if (!acc || t > acc) return t;
          return acc;
        }, null);

  const lastTapAt =
    keyboardEvents.length === 0
      ? null
      : keyboardEvents.reduce<Date | null>((acc, e) => {
          if (!acc || e.createdAt > acc) return e.createdAt;
          return acc;
        }, null);

  return {
    briefsDeliveredCount,
    keyboardTapsCount,
    engagementRate,
    positiveRate,
    tuneCommandsCount,
    distilledPrefsPresent,
    lastBriefAt,
    lastTapAt,
  };
}

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  // Quantise to 4dp to match the numeric(6,4) column.
  return Math.round(n * 10000) / 10000;
}

function isEmptyDistill(prefs: unknown): boolean {
  if (prefs === null || prefs === undefined) return true;
  if (typeof prefs !== "object") return false;
  // Common shapes the distill loop might emit: {} or { rules: [] }.
  const obj = prefs as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return true;
  // Heuristic: arrays-only payloads that are all empty.
  const values = Object.values(obj);
  if (values.length > 0 && values.every((v) => Array.isArray(v) && v.length === 0)) {
    return true;
  }
  return false;
}

/**
 * Fetch + compute + UPSERT for one user. Returns the metrics row that
 * was persisted, so the caller can log / aggregate.
 */
export async function evaluateUser(
  userId: string,
  windowEnd: Date,
  database: typeof defaultDb = defaultDb,
  windowDays = DEFAULT_WINDOW_DAYS
): Promise<{ windowEndDate: string; metrics: FeedbackEvalMetrics }> {
  const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const windowEndDate = windowEnd.toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // Pulled in parallel because they hit disjoint tables.
  const [briefs, events, tunes, userRow] = await Promise.all([
    database
      .select({
        id: digestRuns.id,
        updatedAt: digestRuns.updatedAt,
        createdAt: digestRuns.createdAt,
      })
      .from(digestRuns)
      .where(
        and(
          eq(digestRuns.userId, userId),
          eq(digestRuns.status, "delivered"),
          gte(digestRuns.createdAt, windowStart)
        )
      ),
    database
      .select({
        vote: feedbackEvents.vote,
        signalType: feedbackEvents.signalType,
        source: feedbackEvents.source,
        createdAt: feedbackEvents.createdAt,
      })
      .from(feedbackEvents)
      .where(
        and(eq(feedbackEvents.userId, userId), gte(feedbackEvents.createdAt, windowStart))
      ),
    database
      .select({ createdAt: learningLog.createdAt })
      .from(learningLog)
      .where(
        and(
          eq(learningLog.userId, userId),
          eq(learningLog.source, "tune_command"),
          gte(learningLog.createdAt, windowStart)
        )
      ),
    database
      .select({ distilledPrefs: users.distilledPrefs })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  const distilledPrefs = userRow[0]?.distilledPrefs ?? null;

  const metrics = computeFeedbackEval({
    briefs,
    feedbackEvents: events,
    tuneCommands: tunes,
    distilledPrefs,
  });

  await database
    .insert(feedbackEvalRuns)
    .values({
      userId,
      windowEndDate,
      windowDays,
      briefsDeliveredCount: metrics.briefsDeliveredCount,
      keyboardTapsCount: metrics.keyboardTapsCount,
      engagementRate:
        metrics.engagementRate === null ? null : metrics.engagementRate.toString(),
      positiveRate:
        metrics.positiveRate === null ? null : metrics.positiveRate.toString(),
      tuneCommandsCount: metrics.tuneCommandsCount,
      distilledPrefsPresent: metrics.distilledPrefsPresent,
      lastBriefAt: metrics.lastBriefAt,
      lastTapAt: metrics.lastTapAt,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [feedbackEvalRuns.userId, feedbackEvalRuns.windowEndDate],
      set: {
        windowDays,
        briefsDeliveredCount: metrics.briefsDeliveredCount,
        keyboardTapsCount: metrics.keyboardTapsCount,
        engagementRate:
          metrics.engagementRate === null ? null : metrics.engagementRate.toString(),
        positiveRate:
          metrics.positiveRate === null ? null : metrics.positiveRate.toString(),
        tuneCommandsCount: metrics.tuneCommandsCount,
        distilledPrefsPresent: metrics.distilledPrefsPresent,
        lastBriefAt: metrics.lastBriefAt,
        lastTapAt: metrics.lastTapAt,
        computedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return { windowEndDate, metrics };
}

/**
 * Find users with brief activity in the last 24h. These are the users
 * the daily cron recomputes — we deliberately skip cold users to keep
 * the eval table from blowing up with stale rows.
 */
export async function findUsersToEvaluate(
  windowEnd: Date,
  database: typeof defaultDb = defaultDb
): Promise<string[]> {
  const last24h = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  // Users with at least one delivered brief in the last 24h.
  const briefUsers = await database
    .selectDistinct({ userId: digestRuns.userId })
    .from(digestRuns)
    .where(
      and(
        gte(digestRuns.createdAt, last24h),
        eq(digestRuns.status, "delivered")
      )
    );

  // Also include users who tapped the keyboard or /tune'd in the last
  // 24h — they had pre-window briefs and the eval should reflect their
  // late signal.
  const signalUsers = await database
    .selectDistinct({ userId: feedbackEvents.userId })
    .from(feedbackEvents)
    .where(gte(feedbackEvents.createdAt, last24h));

  const set = new Set<string>();
  for (const r of briefUsers) set.add(r.userId);
  for (const r of signalUsers) set.add(r.userId);
  return [...set];
}

// Silence "imported but unused" for re-exports kept available to tests.
void count;
void desc;
void isNotNull;
void max;
void sql;
