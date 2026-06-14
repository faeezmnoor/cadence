-- CAD-225 (founder ruling 2026-06-14): retire the "pro" (Perplexity Sonar,
-- A2) research stack from the product.
--
-- An informed-judge eval proved the A2 stack grounds ~2.0 — WORSE than the
-- standard tier's 2.4 — at 3x the price (3 credits vs 1), so it is strictly
-- dominated. "pro_websearch" (5 credits) becomes the single advanced option.
-- normalizeStack("pro") now folds to "default" in the app, but any spec rows
-- already persisted with tier='pro' must be migrated to 'default' so they
-- bill 1 credit and serve the standard stack (NOT auto-upgraded to the
-- 5-credit pro_websearch stack).
--
-- The CHECK constraint stays permissive: 0027 already allows
-- ('default','pro','pro_websearch'); we deliberately LEAVE 'pro' a valid
-- value (no constraint change) so this migration can re-run safely and so a
-- stray legacy write doesn't violate the constraint. 'pro' is simply unused
-- by the product now.
--
-- Idempotent: re-running after all pro rows are migrated updates zero rows.

UPDATE public.digest_specs
SET tier = 'default', updated_at = now()
WHERE tier = 'pro';
