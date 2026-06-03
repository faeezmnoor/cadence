-- Security HIGH #2 — per-user rate limiting for cost-runaway endpoints.
--
-- Fixed-window counter table. One row per (user_id, scope). Each request
-- upserts: if the stored window_start is older than the window length,
-- the row is reset to (now(), 1); otherwise count is incremented. The
-- caller compares count to the limit. Atomic via ON CONFLICT … DO UPDATE.
--
-- Why a table instead of in-memory: Vercel functions are multi-instance
-- and short-lived. We need cross-instance state. Postgres is already in
-- the request path so this adds one extra round-trip vs. a new Redis dep.
--
-- Scopes used so far:
--   chat_turn   — POST /api/chat, 5 turns / 60s (LLM cost runaway guard)
--
-- New scopes can reuse this table — keep the limit + window in code, not
-- the schema.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

-- RLS: server-only table (service role writes/reads). Block any direct
-- client access just in case PostgREST ever sees it.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
