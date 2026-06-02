-- Phase 3 / CAD-36 follow-up: DST fall-back duplicate-fire fix.
--
-- Problem
--   The cron dispatcher's idempotency anchor is the partial UNIQUE on
--   (spec_id, delivery_minute_utc) from migration 0004. That key catches
--   two dispatchers racing on the SAME UTC minute, but it does NOT catch
--   the case where the user's local wall-clock 01:30 happens twice on the
--   DST fall-back day — those two fires land on DIFFERENT UTC minutes
--   (00:30Z BST and 01:30Z GMT for Europe/London on 2026-10-25) and both
--   pass the UNIQUE check, producing TWO deliveries.
--
-- Fix
--   Add a coarser idempotency key keyed on the user's local calendar day
--   in the spec's tz. The dispatcher computes `delivery_calendar_day_local`
--   on INSERT; a partial UNIQUE index makes a same-day double-fire
--   collapse via ON CONFLICT DO NOTHING just like the minute-level claim.
--
--   The minute-level claim stays — it's still the right anchor for
--   retries inside a single local day (e.g. the worker re-running). The
--   calendar-day claim adds the second layer specifically for
--   wall-clock-equal-but-utc-different fires.
--
-- Compatibility
--   - Column is nullable so legacy rows (no Phase-3 dispatch path) stay
--     valid.
--   - Partial UNIQUE only enforces on non-null values — same shape as
--     the spec_minute uq from 0004.

ALTER TABLE "digest_runs"
  ADD COLUMN IF NOT EXISTS "delivery_calendar_day_local" date;

CREATE UNIQUE INDEX IF NOT EXISTS "digest_runs_spec_local_day_uq"
  ON "digest_runs" ("spec_id", "delivery_calendar_day_local")
  WHERE "delivery_calendar_day_local" IS NOT NULL;
