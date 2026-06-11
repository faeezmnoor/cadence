-- CAD-222 (post-merge review P0): extend the digest_specs.tier CHECK
-- vocabulary with 'pro_websearch'.
--
-- PR #36 shipped the three-stack registry + routers + picker but missed
-- that migration 0023 enforces the tier vocabulary AT THE DATABASE via
-- digest_specs_tier_check. Without this migration every save of the
-- 5-credit "Advanced · live web search" option fails the constraint.
-- Caught by the independent post-merge review (finding 1) — the
-- structural test (pro-tier-spec-tier.test.ts) now asserts THIS file
-- carries the full vocabulary so the next stack addition can't repeat
-- the miss.
--
-- Same in-place CHECK-swap pattern 0023 chose deliberately over a pg
-- enum ("a CHECK constraint is editable in-place"). Drop + re-add is
-- atomic inside the DO block's implicit transaction; existing rows
-- ('default' | 'pro') all satisfy the widened predicate so the re-add
-- never scans into a failure.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'digest_specs_tier_check'
  ) THEN
    ALTER TABLE public.digest_specs
      DROP CONSTRAINT digest_specs_tier_check;
  END IF;

  ALTER TABLE public.digest_specs
    ADD CONSTRAINT digest_specs_tier_check
    CHECK (tier IN ('default', 'pro', 'pro_websearch'));
END $$;
