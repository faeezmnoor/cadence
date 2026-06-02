/**
 * T-407 (CAD-48): daily feedback-eval recompute.
 *
 * Runs once a day at 01:30 UTC (09:30 MYT) — right after the 01:00 UTC
 * smoke summary (T-306). The window is 7 days rolling, ending at trigger
 * time; we recompute eval rows for every user with brief activity or
 * feedback in the last 24h.
 *
 * Idempotency:
 *   `evaluateUser` UPSERTs on (user_id, window_end_date), so re-running
 *   the cron on the same calendar day is safe (it overwrites).
 *
 * Output:
 *   Structured `evaluated` log line per user. We deliberately do NOT
 *   Telegram-send the digest — the admin viewer at /admin/feedback is
 *   the surface. Smoke summary already covers the daily Telegram ping.
 */
import { inngest } from "../client";
import { evaluateUser, findUsersToEvaluate } from "@/server/eval/feedback-eval";

export const feedbackEvalCron = inngest.createFunction(
  {
    id: "feedback-eval-cron",
    name: "Feedback eval daily recompute (T-407)",
    concurrency: { limit: 1 },
    triggers: [
      // 01:30 UTC = 09:30 MYT. After smoke summary so feedback signal
      // from the most-recent smoke brief is included in the window.
      { cron: "30 1 * * *" },
    ],
  },
  async ({ step, logger }) => {
    const windowEnd = new Date();

    const userIds = await step.run("find-users", async () => {
      return findUsersToEvaluate(windowEnd);
    });

    logger.info("feedback-eval: users to evaluate", { count: userIds.length });

    const results: Array<{ userId: string; briefs: number; taps: number }> = [];
    for (const userId of userIds) {
      const { metrics } = await step.run(`eval-${userId}`, async () => {
        return evaluateUser(userId, windowEnd);
      });
      results.push({
        userId,
        briefs: metrics.briefsDeliveredCount,
        taps: metrics.keyboardTapsCount,
      });
    }

    logger.info("feedback-eval: complete", {
      windowEndIso: windowEnd.toISOString(),
      evaluated: results.length,
    });

    return {
      windowEndIso: windowEnd.toISOString(),
      evaluatedCount: results.length,
      results,
    };
  }
);
