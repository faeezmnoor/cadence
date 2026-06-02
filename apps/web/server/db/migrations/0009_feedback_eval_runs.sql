-- Phase 4 / T-407 (CAD-48): feedback loop evaluation harness.
--
-- One row per (user_id, window_end_date). The eval cron recomputes per
-- user, per window — we PRIMARY KEY on (user_id, window_end_date) so
-- repeated recomputes are idempotent UPSERTs rather than ever-growing
-- audit rows. (We do not need a forensic history of eval recomputes;
-- the underlying digest_runs + feedback_events tables are the truth.)
--
-- Window semantics:
--   - window_end_date: the local calendar date at recompute time, MYT.
--     We bucket by date (not minute) because the cron runs once daily.
--   - window_days: 7 (rolling), hardcoded for now. If we ever need
--     multiple windows we'll add a (user_id, window_end_date, window_days)
--     compound PK instead.
--
-- Metrics rationale (see also: docs/EVAL.md / project_cadence memory):
--   - engagement_rate: tap density per brief — answers "do users tap the
--     keyboard at all?". Null when briefs_delivered_count == 0 (avoid
--     0/0 lying as "0% engagement").
--   - positive_rate: (up + love) / total taps — directional signal
--     quality. Null when no taps.
--   - tune_commands_count: explicit-intent signal volume. The richest
--     learning signal per byte.
--   - distilled_prefs_present: did the distill loop ever produce
--     anything for this user? Bool because the column is jsonb-or-null
--     in `users`.
--   - last_brief_at / last_tap_at: aliveness pulses for the admin
--     viewer's "stale user" sort.
--
-- Numeric ranges: engagement_rate and positive_rate are 0..1; we keep
-- them as numeric(6,4) so 0.0000..1.0000 fits cleanly. Nullable to
-- distinguish "no data" from "0".

CREATE TABLE IF NOT EXISTS "feedback_eval_runs" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "window_end_date" date NOT NULL,
  "window_days" integer NOT NULL DEFAULT 7,
  "briefs_delivered_count" integer NOT NULL DEFAULT 0,
  "keyboard_taps_count" integer NOT NULL DEFAULT 0,
  "engagement_rate" numeric(6,4),
  "positive_rate" numeric(6,4),
  "tune_commands_count" integer NOT NULL DEFAULT 0,
  "distilled_prefs_present" boolean NOT NULL DEFAULT false,
  "last_brief_at" timestamptz,
  "last_tap_at" timestamptz,
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "window_end_date")
);

-- Admin viewer sorts newest-first; this also helps the cron's "users with
-- activity in the last 24h" pre-filter.
CREATE INDEX IF NOT EXISTS "idx_feedback_eval_runs_window_end_date"
  ON "feedback_eval_runs" ("window_end_date" DESC);

-- RLS: this is admin-only data. Lock it down hard — no user-side reads.
-- The eval cron uses the service-role connection (RLS bypassed); the
-- admin tRPC procedure runs SECURITY DEFINER-ish via the service-role db
-- client, same pattern as digest_runs reads in admin.listRuns.
ALTER TABLE "feedback_eval_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback_eval_runs" FORCE ROW LEVEL SECURITY;
-- No policies = deny all for non-service-role roles. Service role
-- bypasses RLS by default in Supabase, which is exactly what we want.
