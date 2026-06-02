-- T-506b: Move trial credit grant from first-brief-delivered to user signup.
--
-- Why: Faeez (2026-06-02) — don't over-optimize unit economics on a product
-- that isn't usable yet. New users should see 3 credits the moment they
-- exist, not after they successfully receive a brief. Onboarding-completion
-- bonuses are a separate concern for later.
--
-- Mechanism:
--   1. Replace handle_new_auth_user() so the same AFTER INSERT trigger that
--      mirrors auth.users → public.users ALSO stamps credits_balance=3 and
--      trial_credits_granted_at=now(), and writes the matching
--      transactions ledger row.
--   2. Backfill: any existing public.users row with
--      trial_credits_granted_at IS NULL gets the same one-shot grant.
--
-- Idempotency:
--   - The transactions INSERT and the users UPDATE both gate on
--     trial_credits_granted_at IS NULL inside a single statement, so
--     re-running is safe.
--   - The trigger uses ON CONFLICT (id) DO NOTHING on the public.users
--     insert; if a row already exists it falls through to the grant block
--     which itself gates on IS NULL.
--
-- SECURITY DEFINER + locked search_path retained from 0002 — function runs
-- as table owner so it can write into public.users + public.transactions
-- regardless of the inserting role's grants (Supabase auth signups run as
-- the supabase_auth_admin role).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance integer;
BEGIN
  -- 1. Mirror auth.users → public.users (unchanged from 0002).
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- 2. One-shot trial grant: 3 credits, stamped, ledger row.
  --    The IS NULL gate makes this idempotent — a re-fired trigger or a
  --    backfill cannot double-grant.
  UPDATE public.users
     SET credits_balance         = credits_balance + 3,
         trial_credits_granted_at = NOW(),
         updated_at              = NOW()
   WHERE id = NEW.id
     AND trial_credits_granted_at IS NULL
   RETURNING credits_balance INTO v_balance;

  IF FOUND THEN
    INSERT INTO public.transactions
      (user_id, type, credits_delta, balance_after, metadata)
    VALUES
      (NEW.id, 'trial_grant', 3, v_balance,
       jsonb_build_object('source', 'signup'));
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (already created in 0002); CREATE OR REPLACE
-- on the function is enough. Re-assert defensively in case of fresh DBs.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Backfill: existing users without a trial grant get it now.
-- One transaction so the ledger row + balance bump + stamp land together.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_balance integer;
BEGIN
  FOR r IN
    SELECT id FROM public.users
     WHERE trial_credits_granted_at IS NULL
  LOOP
    UPDATE public.users
       SET credits_balance         = credits_balance + 3,
           trial_credits_granted_at = NOW(),
           updated_at              = NOW()
     WHERE id = r.id
       AND trial_credits_granted_at IS NULL
     RETURNING credits_balance INTO v_balance;

    IF FOUND THEN
      INSERT INTO public.transactions
        (user_id, type, credits_delta, balance_after, metadata)
      VALUES
        (r.id, 'trial_grant', 3, v_balance,
         jsonb_build_object('source', 'backfill_0013'));
    END IF;
  END LOOP;
END $$;
