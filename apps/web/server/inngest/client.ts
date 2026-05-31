import { Inngest } from "inngest";

/**
 * Single Inngest client for the Cadence app. All cron, scheduled, and
 * background work (digest runs, RSS polling, weekly distill) registers
 * here.
 */
export const inngest = new Inngest({ id: "cadence" });
