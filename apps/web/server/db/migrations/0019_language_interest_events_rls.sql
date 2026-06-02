-- QA P0 #1 — RLS leak on language_interest_events.
--
-- Migration 0018 created the table without enabling RLS, so the anon API key
-- could read/write/delete every row through PostgREST. The table holds
-- (user_id, language_code, created_at) triples — low-sensitivity in isolation
-- but still PII when joined to auth.users, and writes are forgeable.
--
-- Lock it down with the same pattern as 0001_rls_policies: SELECT + INSERT
-- restricted to the row owner; service-role bypasses RLS for admin reads and
-- DELETEs (we don't expose a delete path to end users, and don't need one
-- — the cascade from users.id ON DELETE CASCADE handles right-to-erasure).

ALTER TABLE public.language_interest_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "language_interest_self_select"
  ON public.language_interest_events
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "language_interest_self_insert"
  ON public.language_interest_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No UPDATE / DELETE policy. Service role bypasses RLS for admin work; end
-- users cannot edit or remove interest signals through the anon key.
