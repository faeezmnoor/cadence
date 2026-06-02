-- PM-audit #11: account self-deletion audit table.
--
-- public.users.deleted_at already exists (soft-delete sentinel — schema.ts
-- line 53). What was missing: a forensic trail of WHY/WHEN someone deleted
-- their account, kept INDEPENDENTLY of the row that's being soft-deleted.
-- PDPA "right to erasure" requests are commonly audited; Stripe MY KYC
-- also asks for evidence of GDPR/PDPA-equivalent process.
--
-- Schema:
--   id           uuid pk
--   user_id      uuid — NOT FK'd (the user row may eventually hard-delete)
--   email        text — captured at delete time
--   reason       text NULL — optional free-form reason
--   created_at   timestamptz default now()
--
-- Idempotent: IF NOT EXISTS guards make this safe to re-run.

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_user_id
  ON public.account_deletions (user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletions_created_at
  ON public.account_deletions (created_at DESC);

-- RLS: deny-all to anon + authenticated; only the service role writes here.
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_deletions'
      AND policyname = 'account_deletions_no_access'
  ) THEN
    CREATE POLICY account_deletions_no_access ON public.account_deletions
      FOR ALL TO authenticated, anon
      USING (false) WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE public.account_deletions IS
  'PM-audit #11: append-only audit trail of user-initiated account deletions. PDPA evidence.';
