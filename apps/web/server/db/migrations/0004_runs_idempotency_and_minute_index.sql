-- Phase 3 / T-301 + T-302: tz-aware minute cron + run idempotency.
--
-- Background:
--   The MVP digest pipeline assumed at most ONE delivery per (user, UTC date),
--   enforced by the UNIQUE index `digest_runs_user_run_date_uq`. That
--   assumption holds for the single-spec-per-user world we shipped in Phase
--   1-2 but breaks the moment we introduce:
--     - multi-tz dispatch where two specs for the same user could fire at
--       different local times on the same UTC date,
--     - weekly + daily specs co-existing for one user (CAD-37 follow-up),
--     - retry semantics that re-enqueue without changing the date.
--
--   The minute-precision dispatcher claims a delivery slot using a different
--   key: (spec_id, delivery_minute_utc). One spec, one minute, one row — full
--   stop. Two cron workers racing in the same minute both call ON CONFLICT
--   DO NOTHING and only the row-creator dispatches.
--
-- T-303 readiness:
--   `attempt_count` and `last_error` land here so the retry-with-flag work
--   (CAD-38) does not need another migration. Default attempt_count=0 ==
--   "claimed but not yet attempted"; the dispatcher bumps it before each
--   pipeline call.

ALTER TABLE "digest_runs"
  ADD COLUMN IF NOT EXISTS "delivery_minute_utc" timestamp with time zone;

ALTER TABLE "digest_runs"
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "digest_runs"
  ADD COLUMN IF NOT EXISTS "last_error" text;

-- Drop the old (user_id, run_date) UNIQUE — keep the column shape, recreate
-- it as a plain index so existing read queries (sampleNow recency lookup) keep
-- their planner hints. If the unique already vanished from a partial apply,
-- DROP INDEX IF EXISTS keeps this idempotent.
DROP INDEX IF EXISTS "digest_runs_user_run_date_uq";
CREATE INDEX IF NOT EXISTS "idx_digest_runs_user_run_date"
  ON "digest_runs" ("user_id", "run_date");

-- The real idempotency contract. Two dispatcher invocations in the same
-- minute both INSERT ... ON CONFLICT DO NOTHING; exactly one wins.
-- Backfill: existing rows have NULL delivery_minute_utc, so the partial
-- predicate excludes them. New rows MUST set it.
CREATE UNIQUE INDEX IF NOT EXISTS "digest_runs_spec_minute_uq"
  ON "digest_runs" ("spec_id", "delivery_minute_utc")
  WHERE "delivery_minute_utc" IS NOT NULL;
