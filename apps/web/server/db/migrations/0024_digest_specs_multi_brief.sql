-- Multi-brief Phase A foundation — extend digest_specs for N briefs per user.
--
-- This migration is the schema half of the multi-brief work (techdesign-v1
-- §schema-changes). Drizzle schema mirrors it in the same wave. The is_current
-- column is RETAINED (made nullable) so the legacy single-brief code paths
-- — digestSpec.updateRaw, save-spec.ts, /spec page, cron-dispatch fallback
-- — keep working unmodified through Phase A. Migration 0025 drops the column
-- once all callers are ported.
--
-- New columns:
--   status                  text     NOT NULL  CHECK in ('active','paused','archived','superseded')
--   name                    text     NOT NULL  user-facing label, auto-generated for backfilled rows
--   scheduling              jsonb    NOT NULL  canonical SchedulingRuleV1 (Zod-validated app-side)
--   next_run_at             timestamptz        materialized hint for dispatcher early-filter
--   paused_at               timestamptz        when status flipped to paused
--   archived_at             timestamptz        when status flipped to archived
--
-- chat_threads.status: CHECK constraint added (currently no DB-level
-- enforcement; values used are 'active' | 'completed' | 'archived').
-- The 'archived' value is in active use by the reset-bug fix (HEAD 9de1d5e).

BEGIN;

-- 1. Add columns. Nullable first; backfill; then lock.
ALTER TABLE public.digest_specs
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS scheduling jsonb,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Backfill from existing data.
--
-- status:
--   is_current=true   -> 'active'
--   is_current=false  -> 'archived'  (per Faeez decision 2026-06-05: legacy
--                       superseded versions become 'archived' so they stay
--                       recoverable / visible in version history but are
--                       hidden from the default /briefs list; the techdesign
--                       called them 'superseded' but Faeez asked for the
--                       simpler 2-state model — archived rows whose
--                       updated_at predates the user's most-recent active
--                       spec are functionally the same as 'superseded')
--
-- name: derive from spec.topicHint or first topic; fall back to 'My brief'.
--
-- scheduling: build canonical shape from legacy spec.cadence + users.timezone
-- + created_at as the startDate seed. This is a coarse mapping — the runner
-- script re-validates against the SchedulingRuleV1 Zod schema and updates
-- malformed rows. Worst-case the row is left with status='active' and a
-- best-effort scheduling jsonb; the JS evaluator handles missing skipDates /
-- skipWhen via Zod defaults.
UPDATE public.digest_specs ds
SET
  status = CASE WHEN ds.is_current = true THEN 'active' ELSE 'archived' END,
  name = COALESCE(
    NULLIF(ds.spec->>'topicHint', ''),
    NULLIF((ds.spec->'topics'->>0), ''),
    'My brief'
  ),
  scheduling = jsonb_build_object(
    'version', 1,
    'startDate', to_char(ds.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'endDate', NULL,
    'timeLocal', COALESCE(ds.spec->'cadence'->>'delivery_time_local', '08:00'),
    'timezone', COALESCE((SELECT u.timezone FROM public.users u WHERE u.id = ds.user_id), 'Asia/Kuala_Lumpur'),
    'cadence', CASE
      WHEN ds.spec->'cadence'->>'frequency' = 'weekly' THEN
        jsonb_build_object(
          'kind', 'weekly',
          'weekdays', COALESCE(ds.spec->'cadence'->'days_of_week', '[1,2,3,4,5]'::jsonb)
        )
      WHEN ds.spec->'cadence'->>'frequency' = 'monthly' THEN
        jsonb_build_object('kind', 'monthly', 'monthlyDay', 1)
      ELSE
        jsonb_build_object(
          'kind', 'daily',
          'weekdays', COALESCE(ds.spec->'cadence'->'days_of_week', '[1,2,3,4,5,6,7]'::jsonb)
        )
    END,
    'skipDates', '[]'::jsonb,
    'skipWhen', '{}'::jsonb
  ),
  archived_at = CASE WHEN ds.is_current = false THEN ds.updated_at ELSE NULL END
WHERE ds.status IS NULL OR ds.name IS NULL OR ds.scheduling IS NULL;

-- 3. Lock the NOT NULL contracts. next_run_at intentionally nullable —
-- paused/archived rows have no next run; active rows get populated by the
-- runner script's post-SQL pass via the JS evaluator.
ALTER TABLE public.digest_specs
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN scheduling SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN name SET DEFAULT 'Untitled brief',
  ALTER COLUMN scheduling SET DEFAULT '{}'::jsonb;

-- 4. CHECK constraint on status. Guarded so re-runs are idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'digest_specs_status_chk') THEN
    ALTER TABLE public.digest_specs
      ADD CONSTRAINT digest_specs_status_chk
      CHECK (status IN ('active', 'paused', 'archived', 'superseded'));
  END IF;
END $$;

-- 5. Loosen is_current to nullable so future writes can either:
--    - keep mirroring (Phase A: legacy code paths still write isCurrent), or
--    - leave it NULL (Phase B+: new code paths write only status).
-- The default is left in place so existing INSERTs without an explicit
-- value still get true (matching legacy single-brief semantics).
ALTER TABLE public.digest_specs
  ALTER COLUMN is_current DROP NOT NULL;

COMMENT ON COLUMN public.digest_specs.is_current IS
  'DEPRECATED 0024 — kept nullable for one wave so legacy single-brief writes keep working. Drops in migration 0025 once all callers migrate to status=''active''.';

-- 6. Indexes.
--    Replace the (user_id, is_current) partial with (user_id, status) for the
--    visible/listable-briefs query path. The next_run_at partial is the
--    multi-brief dispatcher's primary early-filter target.
DROP INDEX IF EXISTS public.idx_digest_specs_user_current;

CREATE INDEX IF NOT EXISTS idx_digest_specs_user_status
  ON public.digest_specs (user_id, status)
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_digest_specs_next_run
  ON public.digest_specs (next_run_at)
  WHERE status = 'active' AND next_run_at IS NOT NULL;

-- 7. chat_threads.status CHECK. Currently un-enforced; reset-bug fix
-- (HEAD 9de1d5e) introduced the 'archived' value. Lock it down so a
-- future typo doesn't silently widen the vocabulary.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_status_chk') THEN
    ALTER TABLE public.chat_threads
      ADD CONSTRAINT chat_threads_status_chk
      CHECK (status IN ('active', 'completed', 'archived'));
  END IF;
END $$;

COMMIT;
