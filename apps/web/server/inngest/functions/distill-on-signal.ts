/**
 * Event-triggered distill (CAD-220, Part 2).
 *
 * The Sunday weekly-distill sweep (T-405) means a Monday /tune or reply
 * note can sit raw for almost a week before it folds into
 * users.distilled_prefs. This function reacts to `learning/signal.recorded`
 * (emitted by every learning_log write site) and runs the SAME per-user
 * distill — `distillUser` from weekly-distill.ts — as soon as a user has
 * accumulated enough signal:
 *
 *   - ≥3 un-distilled learning_log rows, OR
 *   - the oldest un-distilled row is >72h old.
 *
 * Inngest debounce (30m, keyed per user) collapses bursts: a user tapping
 * 👍 on four briefs and firing two /tunes in one sitting triggers ONE
 * distill, 30 minutes after they go quiet.
 *
 * The Sunday cron stays as the sweep — if an event is dropped (best-effort
 * send) or the threshold is never crossed mid-week, the weekly job still
 * picks the rows up. Both paths share distillUser, whose idempotency rules
 * are documented in weekly-distill.ts: re-running on the same un-distilled
 * rows is a safe re-fold.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { inngest } from "../client";
import { LEARNING_SIGNAL_EVENT } from "../learning-signal";
import { db as defaultDb, type DB } from "@/server/db/client";
import { learningLog } from "@/server/db/schema";
import {
  distillUser,
  type WeeklyDistillPerUserResult,
} from "./weekly-distill";

/** Distill as soon as a user has this many un-distilled rows. */
export const DISTILL_SIGNAL_THRESHOLD = 3;

/** ... or when their oldest un-distilled row has waited this long. */
export const DISTILL_MAX_PENDING_AGE_HOURS = 72;

/**
 * Mirror of weekly-distill's MAX_SIGNALS_PER_USER — we only need the count
 * up to the threshold plus the oldest row, so any cap ≥ threshold works;
 * matching the weekly cap keeps the two paths' view of "pending" identical.
 */
const MAX_PENDING_SCAN = 200;

export interface DistillSignalCheck {
  shouldDistill: boolean;
  pendingCount: number;
  oldestPendingAgeHours: number | null;
}

/**
 * Count un-distilled learning_log rows for the user and age the oldest.
 * Pure read — exported so tests can drive it with a fake db + frozen now.
 */
export async function checkDistillThreshold(
  userId: string,
  deps: { db?: DB; now?: Date } = {}
): Promise<DistillSignalCheck> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? new Date();

  const rows = await database
    .select({ createdAt: learningLog.createdAt })
    .from(learningLog)
    .where(and(eq(learningLog.userId, userId), isNull(learningLog.distilledAt)))
    .orderBy(asc(learningLog.createdAt))
    .limit(MAX_PENDING_SCAN);

  const pendingCount = rows.length;
  const oldest = rows[0]?.createdAt ?? null;
  const oldestPendingAgeHours = oldest
    ? (now.getTime() - new Date(oldest).getTime()) / 3_600_000
    : null;

  const shouldDistill =
    pendingCount >= DISTILL_SIGNAL_THRESHOLD ||
    (oldestPendingAgeHours !== null &&
      oldestPendingAgeHours > DISTILL_MAX_PENDING_AGE_HOURS);

  return { shouldDistill, pendingCount, oldestPendingAgeHours };
}

export interface DistillOnSignalOutput extends DistillSignalCheck {
  distilled: boolean;
  result?: WeeklyDistillPerUserResult;
}

/**
 * Check-then-distill for one user. Extracted from the Inngest handler so
 * the test suite can exercise the trigger rules with a stubbed
 * perUserDistill — same testing seam weekly-distill exposes via deps.
 */
export async function runDistillOnSignal(
  userId: string,
  deps: {
    db?: DB;
    now?: Date;
    perUserDistill?: typeof distillUser;
  } = {}
): Promise<DistillOnSignalOutput> {
  const perUserDistill = deps.perUserDistill ?? distillUser;

  const check = await checkDistillThreshold(userId, {
    ...(deps.db ? { db: deps.db } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  if (!check.shouldDistill) {
    return { distilled: false, ...check };
  }

  const result = await perUserDistill(
    userId,
    deps.db ? { db: deps.db } : {}
  );
  return { distilled: true, ...check, result };
}

export const distillOnSignal = inngest.createFunction(
  {
    id: "distill-on-signal",
    name: "Event-triggered distill on learning signal (CAD-220)",
    // Burst-collapse: one run per user, 30 minutes after their last signal.
    debounce: { period: "30m", key: "event.data.userId" },
    // Never two concurrent distills for the same user (e.g. a debounce
    // flush racing a webhook retry); distillUser is re-fold-safe but
    // serializing avoids double LLM spend.
    concurrency: { limit: 1, key: "event.data.userId" },
    triggers: [{ event: LEARNING_SIGNAL_EVENT }],
  },
  async ({ event, step, logger }) => {
    const userId =
      typeof event.data?.userId === "string" ? event.data.userId : null;
    if (!userId) {
      logger.warn("distill-on-signal: event missing userId", {
        data: event.data,
      });
      return { distilled: false, reason: "missing userId" };
    }

    // Single step: the threshold check is cheap and re-running it on an
    // Inngest retry is correct (rows distilled by a competing run drop the
    // count back below threshold → clean no-op).
    const output = await step.run("distill-if-ready", () =>
      runDistillOnSignal(userId)
    );

    logger.info("distill-on-signal: done", {
      userId,
      distilled: output.distilled,
      pendingCount: output.pendingCount,
      oldestPendingAgeHours: output.oldestPendingAgeHours,
    });

    return output;
  }
);
