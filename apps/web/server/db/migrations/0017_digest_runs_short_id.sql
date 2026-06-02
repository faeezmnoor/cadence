-- Stream E #6 — per-brief permalink.
--
-- Adds digest_runs.short_id (12-char nanoid, unique) so each delivered brief
-- has a stable, shareable URL: cadence.app/b/<short_id>. New rows get a
-- short_id at insert time via the application; existing rows are backfilled
-- by the apply script with random shortIds.
--
-- Format: alphanumeric (a-zA-Z0-9), 12 chars. Collision space ~62^12 ~= 3e21.

ALTER TABLE public.digest_runs
  ADD COLUMN IF NOT EXISTS short_id text;

CREATE UNIQUE INDEX IF NOT EXISTS digest_runs_short_id_uq
  ON public.digest_runs (short_id)
  WHERE short_id IS NOT NULL;
