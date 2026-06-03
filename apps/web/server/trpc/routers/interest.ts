/**
 * interest.* — capture "notify me when X ships" signals.
 *
 * Stream E #7 (PM audit G4). Until Cadence delivers Bahasa Malaysia and
 * Chinese end-to-end (config agent + composer + tune commands), the chat
 * UI exposes those chips as "Coming July — notify me" instead of
 * pretending we deliver them today.
 *
 * QA P2 #2 (decision 2026-06-03): explicit email opt-in. The earlier
 * implicit "tap chip == interest" form left it ambiguous whether the
 * user actually wanted email contact. The chat now shows a small inline
 * form pre-filled with the session email but editable, and the row stores
 * the captured email so the launch-day notify list is unambiguous.
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
        /**
         * Captured email from the inline opt-in form. Optional so the
         * pre-0021 client surface keeps working during rollout; once the
         * new UI is fully deployed every call ships this.
         */
        email: z.string().email().max(254).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email ?? ctx.user.email ?? null;
      await db.insert(languageInterestEvents).values({
        userId: ctx.user.id,
        languageCode: input.languageCode,
        email,
      });
      return { ok: true as const, languageCode: input.languageCode, email };
    }),
});
