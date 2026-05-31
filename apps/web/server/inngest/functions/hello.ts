import { inngest } from "../client";

/**
 * Smoke-test function for T-007. Listens for `app/hello` events and logs.
 * Real product functions (digest.run, cron.minute.tick, learning.distill)
 * land in later tickets.
 */
export const hello = inngest.createFunction(
  {
    id: "hello",
    triggers: [{ event: "app/hello" }],
  },
  async ({ event, step }) => {
    await step.run("log-greeting", () => {
      console.log("[inngest:hello]", event.data ?? {});
      return { ok: true };
    });
    return { greeted: true };
  }
);
