-- T-101-QA: Auto-provision a public.users row for every auth.users row.
--
-- Bug found in Phase-1 QA: tRPC/REST writes use ctx.user.id (the Supabase
-- auth UUID) as user_id on app tables. Those columns FK into public.users(id),
-- but nothing was creating the matching public.users row at signup. First
-- magic-link sign-in → /chat → 23503 FK violation → user gets a 500.
--
-- Fix: trigger on auth.users insert that mirrors id + email into public.users.
-- Backfill any existing auth users in the same transaction.
--
-- SECURITY DEFINER + locked search_path is required for triggers on auth.* —
-- the function runs as the table owner (postgres) so it can write into
-- public.users without depending on the inserting role's grants.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: any auth users created before this trigger existed need a
-- matching public.users row right now or they'll still hit the FK error.
INSERT INTO public.users (id, email)
SELECT id, email
FROM auth.users
ON CONFLICT (id) DO NOTHING;
