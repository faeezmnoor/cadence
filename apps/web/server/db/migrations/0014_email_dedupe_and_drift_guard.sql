-- T-412: Email-dedup defense + identity-drift guard.
--
-- Two layers of defense against same-email duplicate accounts (Google OAuth
-- vs magic-link race, or any future Supabase auto-linking miss):
--
-- 1. UNIQUE INDEX on LOWER(email) — even if Supabase ever creates two
--    auth.users rows with the same email, the second public.users row
--    insert fails loudly. No silent double-grant of trial credits.
--
-- 2. handle_new_auth_user() drift guard — before mirroring the new
--    auth.users row, check whether a public.users row already exists
--    for the same case-insensitive email under a DIFFERENT id. If so,
--    we have identity drift and refuse to mint a duplicate. The user
--    needs to be re-linked via Supabase Account Linking, not silently
--    duplicated.

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON public.users (LOWER(email));

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance integer;
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_existing_id
    FROM public.users
   WHERE LOWER(email) = LOWER(NEW.email)
   LIMIT 1;

  IF v_existing_id IS NOT NULL AND v_existing_id <> NEW.id THEN
    RAISE NOTICE 'auth_identity_drift: auth.users.id=% email=% already mapped to public.users.id=%', NEW.id, NEW.email, v_existing_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

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
$function$;
