-- CAD-165 / CAD-228: per-spec web-search provider for the Standard stack.
--
-- Adds digest_specs.searcher (default 'brave') so each watch can pick which
-- pluggable web-search provider its Standard brief uses (Decisions Log D-011:
-- Cadence maintains a registry of Searcher providers). Advanced tiers run
-- their own search (Perplexity / Anthropic native) and ignore this column.
--
-- Same in-place CHECK-swap pattern as the tier column (0023 / 0027): a CHECK
-- constraint is editable in-place, and the vocabulary grows by one line per
-- newly-registered provider. Existing rows all default to 'brave', which
-- satisfies the predicate, so the re-add never scans into a failure.
--
-- NOTE: app-layer validation (server/ai/providers/searchers.ts registry +
-- the briefs.setSearcher zod enum) is the primary guard; this CHECK is
-- defence-in-depth against a raw write. The pipeline additionally auto-falls
-- back to DuckDuckGo (keyless) if the selected provider errors/empties.

ALTER TABLE public.digest_specs
  ADD COLUMN IF NOT EXISTS searcher text NOT NULL DEFAULT 'brave';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'digest_specs_searcher_check'
  ) THEN
    ALTER TABLE public.digest_specs
      DROP CONSTRAINT digest_specs_searcher_check;
  END IF;

  ALTER TABLE public.digest_specs
    ADD CONSTRAINT digest_specs_searcher_check
    CHECK (searcher IN ('brave', 'duckduckgo'));
END $$;
