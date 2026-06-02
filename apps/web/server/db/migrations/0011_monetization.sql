-- T-501a: Monetization substrate.
--
-- Adds:
--   1. users columns: credits_balance, cost_to_us_micro_usd, country_code,
--      auto_topup_pack_id, auto_topup_threshold_credits,
--      trial_credits_granted_at.
--   2. transactions table — running credit ledger (topup, charge,
--      trial_grant, admin_grant, refund, promo).
--   3. pricing_snapshots table — append-only price/FX snapshots; current
--      row has active_to = NULL.
--   4. RLS deny-all on both new tables; service-role-only access.
--
-- Idempotent: each ADD COLUMN uses IF NOT EXISTS; each CREATE uses
-- IF NOT EXISTS; policies wrapped in DO blocks with existence checks.
-- Re-run-safe.

-- ---------------------------------------------------------------------
-- 1. users columns
-- ---------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS credits_balance integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cost_to_us_micro_usd bigint NOT NULL DEFAULT 0;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auto_topup_pack_id text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auto_topup_threshold_credits integer;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_credits_granted_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. pricing_snapshots
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id text NOT NULL,
  credits integer NOT NULL,
  price_minor_usd integer NOT NULL,
  price_minor_myr integer NOT NULL,
  fx_rate_usd_to_myr numeric(10, 6) NOT NULL,
  cost_to_us_micro_per_credit bigint NOT NULL,
  active_from timestamptz NOT NULL DEFAULT now(),
  active_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_pack_active
  ON public.pricing_snapshots(pack_id)
  WHERE active_to IS NULL;

-- ---------------------------------------------------------------------
-- 3. transactions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  credits_delta integer NOT NULL,
  balance_after integer NOT NULL,
  amount_minor integer,
  currency text,
  fx_rate_to_usd numeric(10, 6),
  stripe_session_id text,
  pricing_snapshot_id uuid REFERENCES public.pricing_snapshots(id),
  digest_run_id uuid REFERENCES public.digest_runs(id) ON DELETE SET NULL,
  cost_to_us_micro_usd bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_session_id_uq
  ON public.transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. RLS: deny-all on both new tables. Access via service-role only
--    (tRPC procedures use service-role db client).
-- ---------------------------------------------------------------------
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_snapshots ENABLE ROW LEVEL SECURITY;

-- Revoke any default grants to anon / authenticated. service_role bypasses
-- RLS by default in Supabase.
REVOKE ALL ON public.transactions FROM anon, authenticated;
REVOKE ALL ON public.pricing_snapshots FROM anon, authenticated;

-- Explicit deny-all policy (no FOR ALL USING (false) needed since no
-- policies = no access, but we add one defensively so a future
-- accidental GRANT doesn't open the door).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'transactions_deny_all'
  ) THEN
    CREATE POLICY transactions_deny_all ON public.transactions
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_snapshots'
      AND policyname = 'pricing_snapshots_deny_all'
  ) THEN
    CREATE POLICY pricing_snapshots_deny_all ON public.pricing_snapshots
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;
