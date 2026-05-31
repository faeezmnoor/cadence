import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { hello } from "@/server/inngest/functions/hello";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [hello],
});
