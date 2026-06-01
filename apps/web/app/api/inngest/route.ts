import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { hello } from "@/server/inngest/functions/hello";
import { rssPoll } from "@/server/inngest/functions/rss-poll";
import { digestRunFn } from "@/server/inngest/functions/digest-run";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [hello, rssPoll, digestRunFn],
});
