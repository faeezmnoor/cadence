import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { hello } from "@/server/inngest/functions/hello";
import { rssPoll } from "@/server/inngest/functions/rss-poll";
import { digestRunFn } from "@/server/inngest/functions/digest-run";
import { cronDispatch } from "@/server/inngest/functions/cron-dispatch";
import { smokeSummary } from "@/server/inngest/functions/smoke-summary";
import { weeklyDistill } from "@/server/inngest/functions/weekly-distill";
import { feedbackEvalCron } from "@/server/inngest/functions/feedback-eval-cron";

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
  ],
});
