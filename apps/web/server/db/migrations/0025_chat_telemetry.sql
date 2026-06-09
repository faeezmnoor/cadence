-- 0025 — Chat funnel telemetry (Wave 3 / CAD-180).
--
-- Two additive append-only tables underpinning /admin/chat-funnel
-- (deferred to CAD-183) and the extractor precision/recall eval.
--
-- chat_turn_event: one row per user/assistant turn that survives auth +
--   rate-limit + multi-topic gates. Captures char counts + tool-call count
--   for funnel analytics (drop-off between turn 1→2, avg turns to save).
--
-- spec_extraction_event: one row per extractor invocation. Captures raw
--   model output, the merge decision, latency, and cost — feeds the eval
--   harness and lets us track precision/recall over time without running
--   the LLM again.

CREATE TABLE IF NOT EXISTS public.chat_turn_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  turn_idx        integer NOT NULL,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  char_count      integer NOT NULL DEFAULT 0,
  tool_call_count integer NOT NULL DEFAULT 0,
  saved_spec      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_turn_event_thread
  ON public.chat_turn_event(thread_id, turn_idx);
CREATE INDEX IF NOT EXISTS idx_chat_turn_event_user_created
  ON public.chat_turn_event(user_id, created_at DESC);

ALTER TABLE public.chat_turn_event ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_turn_event'
      AND policyname='chat_turn_event_no_anon'
  ) THEN
    CREATE POLICY chat_turn_event_no_anon ON public.chat_turn_event
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS public.spec_extraction_event (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  thread_id         uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  turn_idx          integer NOT NULL,
  raw_extracted     jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_slots     jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_slots    jsonb NOT NULL DEFAULT '{}'::jsonb,
  dropped_slots     jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms        integer,
  cost_micro_usd    bigint,
  status            text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','timeout','error','disabled')),
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spec_extraction_event_thread
  ON public.spec_extraction_event(thread_id, turn_idx);
CREATE INDEX IF NOT EXISTS idx_spec_extraction_event_user_created
  ON public.spec_extraction_event(user_id, created_at DESC);

ALTER TABLE public.spec_extraction_event ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='spec_extraction_event'
      AND policyname='spec_extraction_event_no_anon'
  ) THEN
    CREATE POLICY spec_extraction_event_no_anon ON public.spec_extraction_event
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END $$;
