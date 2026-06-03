-- CAD-88: per-spec tier column for Pro Tier alpha.
--
-- Each DigestSpec carries a default tier ("default" or "pro"). The digest
-- pipeline reads this column and routes to the matching provider bundle
-- via `getProviders(spec.tier)` (CAD-85). Per-brief override (toggle on
-- preview before send) is intentionally deferred — keeps THIS migration
-- a pure additive column.
--
-- Why a constrained text column instead of a Postgres enum:
--   - `pgEnum` migrations are painful (ALTER TYPE … ADD VALUE has txn
--     restrictions); a CHECK constraint is editable in-place and is the
--     pattern we already use for digest_runs.status.
--   - The vocabulary is closed (default | pro) so we want the DB to
--     enforce it — not just the application layer.
--
-- Default 'default' is intentional: every existing spec lands on the
-- cheap stack until Faeez explicitly flips a spec to Pro from the UI.
-- The PRO_TIER_ALPHA env flag still wraps the actual provider swap
-- (CAD-85), so flipping a spec to "pro" with the alpha off is a no-op
-- at runtime — the row just remembers the user's preference.

ALTER TABLE public.digest_specs
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'digest_specs_tier_check'
  ) THEN
    ALTER TABLE public.digest_specs
      ADD CONSTRAINT digest_specs_tier_check
      CHECK (tier IN ('default', 'pro'));
  END IF;
END $$;

-- No index needed: tier is read alongside the row whenever digest/run.ts
-- loads the current spec (single-row SELECT by user_id + is_current).
