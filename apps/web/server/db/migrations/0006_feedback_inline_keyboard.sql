-- Phase 4 / T-401 + T-402 (CAD-42, CAD-43): inline-keyboard feedback loop.
--
-- Two coupled changes:
--   1) digest_specs.keyboard_enabled — per-spec opt-in flag for the 4-button
--      inline keyboard appended to delivered briefs. Defaults TRUE so the
--      smoke spec and all existing specs immediately start collecting
--      dogfood signal. Set FALSE to silence the keyboard without deleting
--      the spec.
--
--   2) feedback_events — widen for callback_query origin:
--      - vote text: high-level intent label (up | down | love | skip).
--        Distinct from signal_type so we can evolve the button set without
--        breaking historical analytics.
--      - telegram_callback_id text UNIQUE: Telegram's callback_query.id is
--        unique per tap; we dedupe on it so a webhook retry can't
--        double-count a vote.
--      - source text default 'free_text': origin of this signal.
--        ('inline_keyboard' for T-401 taps, 'free_text' for legacy.)
--      - signal_type made NULLable: callback-origin rows fill `vote`
--        instead. Keep the column for backwards compat with any preseeded
--        rows / future signal types.

ALTER TABLE "digest_specs"
  ADD COLUMN IF NOT EXISTS "keyboard_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "feedback_events"
  ADD COLUMN IF NOT EXISTS "vote" text;

ALTER TABLE "feedback_events"
  ADD COLUMN IF NOT EXISTS "telegram_callback_id" text;

ALTER TABLE "feedback_events"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'free_text';

-- signal_type was NOT NULL in 0000; make it nullable so callback-only rows
-- (which fill `vote`) don't have to fabricate a signal_type. Existing rows
-- keep their value.
ALTER TABLE "feedback_events"
  ALTER COLUMN "signal_type" DROP NOT NULL;

-- Unique on telegram_callback_id (partial: only when present) for dedupe.
-- Partial because legacy rows / future free-text feedback have NULL here.
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_events_telegram_callback_id_uq"
  ON "feedback_events" ("telegram_callback_id")
  WHERE "telegram_callback_id" IS NOT NULL;
