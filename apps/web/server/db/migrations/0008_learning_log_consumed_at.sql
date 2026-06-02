-- T-404 / CAD-45: composer feedback injection.
--
-- Adds `learning_log.consumed_at` — the timestamp at which a raw
-- learning_log row was first seen by a brief composer's feedback-block
-- builder. Separate semantic from `distilled_at` (which T-405 owns and
-- means "this row has been folded into users.distilled_prefs").
--
-- Why both columns?
--   - `consumed_at` answers: "did this /tune signal influence at least
--     one brief?" — useful for /tune ack debugging and to drive a future
--     "applied since" line in the brief footer.
--   - `distilled_at` answers: "has the weekly distill job folded this
--     into the canonical distilled_prefs blob?" — owned by T-405.
--
-- A row can be consumed before being distilled (composer reads raw rows
-- as a hybrid fallback so /tune takes effect on the *next* brief without
-- waiting for the weekly distill). A row should never be distilled
-- without also being consumed in practice, but we don't enforce that
-- with a constraint — it's a debuggability column, not an integrity one.
--
-- Compatibility: nullable, no default. Pure additive change.

ALTER TABLE "learning_log"
  ADD COLUMN IF NOT EXISTS "consumed_at" timestamptz;
