/**
 * Weekly distill (T-405 / CAD-46).
 *
 * Once a week, for every user with un-distilled `learning_log` rows,
 * fold their raw tuning signals + prior `users.distilled_prefs` into a
 * fresh canonical bias list. Writes the new bullets to
 * `users.distilled_prefs` and stamps `distilled_at = now()` on the
 * raw rows that fed the distill.
 *
 * Cron: Sunday 23:00 MYT (Asia/Kuala_Lumpur is UTC+8 → 15:00 UTC Sunday).
 * Inngest cron syntax accepts a `TZ=...` prefix; we use UTC for clarity
 * and so the schedule never drifts under DST (KL has no DST, but other
 * day-of-week interpretations bite us in admin tooling).
 *
 * Why Sunday 23:00 MYT:
 *   - quiet hour: Faeez (and target ICP business owners) are not
 *     reading briefs; an LLM-cost spike doesn't compete with the
 *     daily 07:00 MYT delivery window.
 *   - end of week: the next week's briefs immediately see the
 *     updated bias.
 *
 * Idempotency:
 *   - We only consume rows whose `distilled_at IS NULL`. A retry of
 *     this function would re-process whoever still has un-distilled
 *     rows; the prior write to `users.distilled_prefs` is overwritten
 *     with a fresh fold. Acceptable — the prompt is stable and the
 *     LLM at temp 0.1 is near-deterministic on identical input.
 *   - We do NOT use Inngest step.run for the distill call itself
 *     because we want the per-user state mutation (LLM + DB writes)
 *     to land atomically per user. If one user's distill throws,
 *     other users still complete.
 *
 * Empty-user fast path:
 *   If a user has zero un-distilled rows, we skip entirely — no LLM
 *   call, no users update. The selector is gated on this.
 *
 * Hybrid model context:
 *   T-404 already exposes raw learning_log rows to the composer with
 *   a `consumed_at` stamp ("seen by at least one brief"). T-405's
 *   `distilled_at` is a separate axis ("folded into the canonical
 *   blob"). A row can be consumed many times before it's distilled
 *   once; after distill it's no longer fetched by the composer's
 *   raw-rows query (which filters distilled_at IS NULL).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { inngest } from "../client";
import { db as defaultDb, type DB } from "@/server/db/client";
import { learningLog, users } from "@/server/db/schema";
import { distillPrefs as defaultDistill } from "@/server/ai/distill/distill";
import type { DistillSignal } from "@/server/ai/distill/prompt";

/**
 * Generous candidate window per user. The distiller prompt is short and
 * Haiku context easily handles 200 short tune signals. We cap to keep
 * cost bounded if a user goes wild on /tune.
 */
const MAX_SIGNALS_PER_USER = 200;

export interface WeeklyDistillPerUserResult {
  userId: string;
  signalCount: number;
  skipped: boolean;
  skipReason?: string;
  priorPrefCount: number;
  newPrefCount: number;
  consumedRowIds: string[];
  costUsd: number;
  error?: string;
}

export interface WeeklyDistillOutput {
  usersScanned: number;
  usersDistilled: number;
  usersSkipped: number;
  usersErrored: number;
  totalCostUsd: number;
  perUser: WeeklyDistillPerUserResult[];
}

/**
 * Pure-ish per-user worker. Pulls candidates, invokes the distill
 * function, writes the result. Exported so the test suite can drive
 * it with a stub `db` and stub `distill`.
 */
export async function distillUser(
  userId: string,
  deps: {
    db?: DB;
    distill?: typeof defaultDistill;
  } = {}
): Promise<WeeklyDistillPerUserResult> {
  const database = deps.db ?? defaultDb;
  const distill = deps.distill ?? defaultDistill;

  // Pull the user row (prior prefs + sanity check).
  const [userRow] = await database
    .select({
      id: users.id,
      distilledPrefs: users.distilledPrefs,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    return {
      userId,
      signalCount: 0,
      skipped: true,
      skipReason: "user not found",
      priorPrefCount: 0,
      newPrefCount: 0,
      consumedRowIds: [],
      costUsd: 0,
    };
  }

  const priorPrefs = Array.isArray(userRow.distilledPrefs)
    ? (userRow.distilledPrefs as string[]).filter((s) => typeof s === "string")
    : [];

  // Pull un-distilled rows, newest first.
  const rawRows = await database
    .select({
      id: learningLog.id,
      rawText: learningLog.rawText,
      createdAt: learningLog.createdAt,
    })
    .from(learningLog)
    .where(and(eq(learningLog.userId, userId), isNull(learningLog.distilledAt)))
    .orderBy(desc(learningLog.createdAt))
    .limit(MAX_SIGNALS_PER_USER);

  if (rawRows.length === 0) {
    // Empty fast path — no LLM call, no write.
    return {
      userId,
      signalCount: 0,
      skipped: true,
      skipReason: "no un-distilled rows",
      priorPrefCount: priorPrefs.length,
      newPrefCount: priorPrefs.length,
      consumedRowIds: [],
      costUsd: 0,
    };
  }

  const signals: DistillSignal[] = rawRows.map((r) => ({
    isoDate: new Date(r.createdAt).toISOString().slice(0, 10),
    text: r.rawText,
  }));

  const distilled = await distill({
    userId,
    priorPrefs,
    signals,
  });

  // Write the new canonical prefs.
  await database
    .update(users)
    .set({
      distilledPrefs: distilled.bullets,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Stamp distilled_at on every row that fed the distill. We do this
  // after the users write so a mid-flight crash leaves the rows
  // un-distilled — they'll be retried next week, which is safe.
  const consumedIds = rawRows.map((r) => r.id);
  const now = new Date();
  for (const id of consumedIds) {
    await database
      .update(learningLog)
      .set({ distilledAt: now, updatedAt: now })
      .where(eq(learningLog.id, id));
  }

  return {
    userId,
    signalCount: signals.length,
    skipped: false,
    priorPrefCount: priorPrefs.length,
    newPrefCount: distilled.bullets.length,
    consumedRowIds: consumedIds,
    costUsd: distilled.costUsd,
  };
}

/**
 * Find the set of user_ids with at least one un-distilled learning_log
 * row. This is the candidate list for the weekly job.
 */
export async function findUsersWithPendingSignals(database: DB = defaultDb): Promise<string[]> {
  const rows = await database
    .selectDistinct({ userId: learningLog.userId })
    .from(learningLog)
    .where(isNull(learningLog.distilledAt));
  return rows.map((r) => r.userId);
}

export const weeklyDistill = inngest.createFunction(
  {
    id: "weekly-distill",
    name: "Weekly distill learning_log -> users.distilled_prefs (T-405)",
    concurrency: { limit: 1 },
    triggers: [
      // Sunday 15:00 UTC == Sunday 23:00 MYT (KL is fixed UTC+8, no DST).
      // Quiet hour: well after the 07:00 MYT daily brief delivery, well
      // before Monday morning briefs.
      { cron: "0 15 * * 0" },
    ],
  },
  async ({ step, logger }) => {
    const candidates = await step.run("find-candidates", async () => {
      return findUsersWithPendingSignals();
    });

    logger.info("weekly-distill: candidates", { count: candidates.length });

    const perUser: WeeklyDistillPerUserResult[] = [];

    for (const userId of candidates) {
      // Per-user step so Inngest checkpoints between users — one bad
      // user can't break the whole batch.
      const result = await step.run(`distill-${userId}`, async () => {
        try {
          return await distillUser(userId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("weekly-distill: user failed", { userId, error: message });
          return {
            userId,
            signalCount: 0,
            skipped: false,
            priorPrefCount: 0,
            newPrefCount: 0,
            consumedRowIds: [],
            costUsd: 0,
            error: message,
          } satisfies WeeklyDistillPerUserResult;
        }
      });
      perUser.push(result);
    }

    const output: WeeklyDistillOutput = {
      usersScanned: candidates.length,
      usersDistilled: perUser.filter((r) => !r.skipped && !r.error).length,
      usersSkipped: perUser.filter((r) => r.skipped).length,
      usersErrored: perUser.filter((r) => Boolean(r.error)).length,
      totalCostUsd: perUser.reduce((acc, r) => acc + (r.costUsd ?? 0), 0),
      perUser,
    };

    logger.info("weekly-distill: done", {
      usersScanned: output.usersScanned,
      usersDistilled: output.usersDistilled,
      usersSkipped: output.usersSkipped,
      usersErrored: output.usersErrored,
      totalCostUsd: output.totalCostUsd,
    });

    return output;
  }
);
