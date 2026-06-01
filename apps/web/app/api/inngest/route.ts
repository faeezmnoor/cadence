import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { hello } from "@/server/inngest/functions/hello";
import { rssPoll } from "@/server/inngest/functions/rss-poll";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [hello, rssPoll],
});
