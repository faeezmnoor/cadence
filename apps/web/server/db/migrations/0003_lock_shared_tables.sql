-- P0 hotfix (2026-06-01): cross-tenant cache poisoning via anon key.
--
-- Background:
--   `source_cache` and `rss_items` were intentionally left RLS-disabled in
--   migration 0001 on the assumption that only service_role workers (Inngest
--   connectors, cron) touch them. That assumption was wrong: PostgREST still
--   grants SELECT/INSERT/UPDATE/DELETE to the `anon` and `authenticated`
--   roles unless RLS or grants explicitly block them — and the anon key is
--   shipped in the client bundle.
--
-- Attack vectors closed by this migration:
--   1. Anon overwrite of `source_cache.payload` for connector='brave_search'
--      → poisoned search results fed into every user's daily brief LLM call
--      (prompt injection vector).
--   2. Anon insert of fake `rss_items` rows for any digest_specs.id.
--   3. Anon SELECT of `source_cache.payload` → leakage of other users'
--      research topics (the cache `key` and payload reveal queries).
--
-- Fix convention follows 0001: ENABLE ROW LEVEL SECURITY with no grants /
-- no policies for anon/authenticated. service_role bypasses RLS, so the
-- Drizzle service-role client (used by connectors + cron + Inngest) keeps
-- full access without any code change.

ALTER TABLE "source_cache" ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all for anon + authenticated. service_role bypasses.
-- Belt-and-braces: revoke PostgREST grants too, in case RLS is ever
-- inadvertently disabled by a future migration.
REVOKE ALL ON TABLE "source_cache" FROM anon, authenticated;

ALTER TABLE "rss_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "rss_items" FROM anon, authenticated;
