-- Evals Phase 0 — per-run metadata bag.
--
-- Adds digest_runs.metadata (jsonb) for ad-hoc post-run signals that don't
-- merit their own column today:
--   - metadata.sourceResolve  -> { rate, results: [{url, status, resolved, latencyMs, error?}], checkedAt }
--   - metadata.manualRating   -> { grounding, specificity, fit, notes?, ratedAt, ratedBy }
--
-- jsonb (not json) so the row-level update path can use jsonb_set if we
-- ever want partial writes; today the application writes the full object.
-- NOT NULL DEFAULT '{}'::jsonb so legacy rows return a usable shape from
-- the admin viewer (no nullable-chain dance in the client).

ALTER TABLE public.digest_runs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
