-- QA P2 #2 — language interest events: explicit email opt-in.
--
-- The BM/中文 chips originally captured only (user_id, language_code) via an
-- implicit interest signal on tap. Faeez decided we should ask explicitly:
-- a small inline form with an editable email pre-filled from the session.
-- This adds the captured email to each interest row so the launch-day
-- notify list is unambiguous (the auth email may have churned by then).

ALTER TABLE public.language_interest_events
  ADD COLUMN IF NOT EXISTS email text;

-- Drop NULLs are fine: pre-0021 rows have no captured email and we'll
-- fall back to users.email at notify time.
CREATE INDEX IF NOT EXISTS idx_language_interest_events_email
  ON public.language_interest_events (email)
  WHERE email IS NOT NULL;
