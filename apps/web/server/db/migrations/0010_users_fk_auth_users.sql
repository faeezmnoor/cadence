-- T-015 / CAD-59 — P2 hardening: prevent orphaned public.users rows.
--
-- Background:
--   Migration 0002 added a trigger that mirrors auth.users INSERT into
--   public.users, but there was no FK to keep the two in sync on DELETE.
--   If an admin deletes a row from auth.users (or Supabase Auth deletion
--   runs from the dashboard), the matching public.users row would be left
--   behind as an orphan — and because most tenant tables FK into
--   public.users(id) ON DELETE cascade, those tenant rows would also
--   survive past the user's account deletion. That's a data-retention bug
--   and a privacy footgun.
--
-- Fix:
--   Add FK public.users.id -> auth.users(id) ON DELETE CASCADE. Deleting
--   the auth row now cascades through public.users and onward through
--   every public.users-anchored FK already in place (digest_specs,
--   digest_runs, feedback_events, learning_log, telegram_link_tokens,
--   chat_threads -> chat_messages, cost_events nullified). FK graph
--   verified in 0000_init_schema.sql.
--
-- Pre-flight (fail-loud, no auto-delete):
--   Before adding the constraint we count orphaned public.users rows
--   (public.users.id with no matching auth.users.id). If any exist, this
--   migration aborts with a RAISE EXCEPTION listing them. Faeez resolves
--   manually, then re-runs. Auto-delete would be too dangerous — these
--   rows might be the user's only artifact and could indicate a previous
--   bug we want to investigate before destroying evidence.
--
-- Idempotency:
--   The constraint add is wrapped so re-running is a no-op once the FK
--   exists. Drizzle's standard ALTER ... ADD CONSTRAINT will error on a
--   second run, so we guard with information_schema.

DO $mig$
DECLARE
  orphan_count integer;
  orphan_sample text;
  fk_exists boolean;
BEGIN
  -- Idempotency: skip if FK already present.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'users'
      AND tc.constraint_name = 'users_id_auth_users_id_fk'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) INTO fk_exists;

  IF fk_exists THEN
    RAISE NOTICE '0010: FK users_id_auth_users_id_fk already exists, skipping.';
    RETURN;
  END IF;

  -- Pre-flight orphan detection. Fail loud, do not auto-delete.
  SELECT count(*) INTO orphan_count
  FROM public.users u
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

  IF orphan_count > 0 THEN
    SELECT string_agg(format('%s <%s>', u.id::text, u.email), ', ')
      INTO orphan_sample
    FROM (
      SELECT id, email
      FROM public.users u
      WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
      LIMIT 10
    ) u;

    RAISE EXCEPTION
      '0010 aborted: % orphaned public.users row(s) have no matching auth.users. Resolve manually before re-running. First 10: %',
      orphan_count, orphan_sample;
  END IF;

  -- Safe to add the constraint.
  ALTER TABLE public.users
    ADD CONSTRAINT users_id_auth_users_id_fk
    FOREIGN KEY (id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;

  RAISE NOTICE '0010: added FK public.users.id -> auth.users.id ON DELETE CASCADE.';
END
$mig$;
