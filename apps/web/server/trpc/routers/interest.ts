/**
 * interest.* — capture "notify me when X ships" signals.
 *
 * Stream E #7 (PM audit G4). Until Cadence delivers Bahasa Malaysia and
 * Chinese end-to-end (config agent + composer + tune commands), the chat
 * UI exposes those chips as "Coming July — notify me" instead of
 * pretending we deliver them today. Tapping a chip writes a row here
 * so we can email this list when the language ships.
 */
import { z } from "zod";
import { db } from "@/server/db/client";
import { languageInterestEvents } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";

const LANGUAGE_CODES = ["ms", "zh"] as const;

export const interestRouter = router({
  /** Record interest in a not-yet-shipped language. Idempotent enough for
   *  our needs — we don't dedupe; repeat taps == stronger signal. */
  registerLanguage: protectedProcedure
    .input(
      z.object({
        languageCode: z.enum(LANGUAGE_CODES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(languageInterestEvents).values({
        userId: ctx.user.id,
        languageCode: input.languageCode,
      });
      return { ok: true as const, languageCode: input.languageCode };
    }),
});
