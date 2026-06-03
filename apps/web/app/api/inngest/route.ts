import { serve } from "inngest/next";
import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/server/inngest/client";

/**
 * Security MEDIUM #4: cold-start assertion that INNGEST_SIGNING_KEY is
 * present in production builds. Without it, Inngest can't verify webhook
 * signatures and our cron pipeline silently degrades to "anyone with the
 * URL can replay events". We Sentry-log + throw at cold start so the
 * deployment is loudly broken, rather than quietly insecure.
 *
 * Dev/preview: skipped — we run unsigned locally on purpose.
 */
if (process.env.NODE_ENV === "production" && !process.env.INNGEST_SIGNING_KEY) {
  const msg =
    "[security] INNGEST_SIGNING_KEY missing in production — refusing to mount /api/inngest unsigned";
  try {
    Sentry.captureMessage(msg, "fatal");
  } catch {
    // Sentry not configured yet — fall through to throw
  }
  throw new Error(msg);
}
import { hello } from "@/server/inngest/functions/hello";
import { rssPoll } from "@/server/inngest/functions/rss-poll";
import { digestRunFn } from "@/server/inngest/functions/digest-run";
import { cronDispatch } from "@/server/inngest/functions/cron-dispatch";
import { smokeSummary } from "@/server/inngest/functions/smoke-summary";
import { weeklyDistill } from "@/server/inngest/functions/weekly-distill";
import { feedbackEvalCron } from "@/server/inngest/functions/feedback-eval-cron";
import { purgeSoftDeletedBriefs_fn } from "@/server/inngest/functions/purge-soft-deleted-briefs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    hello,
    rssPoll,
    digestRunFn,
    cronDispatch,
    smokeSummary,
    weeklyDistill,
    feedbackEvalCron,
    purgeSoftDeletedBriefs_fn,
  ],
});
