-- Stream E #7 — language honesty.
--
-- Captures interest signal when a user taps a "coming July" language chip
-- (Bahasa Malaysia, 中文). We don't claim to deliver these languages today;
-- this table is how we know who to notify when we do.

CREATE TABLE IF NOT EXISTS public.language_interest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  language_code text NOT NULL, -- 'ms' | 'zh'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_language_interest_events_user_created
  ON public.language_interest_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_language_interest_events_lang_created
  ON public.language_interest_events (language_code, created_at DESC);
