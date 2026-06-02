-- T-408 / CAD-70: Persist the config-agent's working draft across chat turns.
--
-- Before this migration, the config agent's draft DigestSpec lived in
-- process memory for one HTTP request only. Each new turn rebuilt an empty
-- session, so `update_spec_field` "forgot" prior fields and
-- `confirm_and_save` blew up because the draft was perpetually incomplete.
--
-- Storage shape: a single jsonb column on chat_threads that mirrors the
-- ConfigAgentSession.draft (DigestSpecDraft). NULL until the agent first
-- writes a draft. Trimmed back to NULL on a successful confirm_and_save
-- (the strict spec lives in digest_specs at that point).
--
-- Why on chat_threads (not a new table): one draft per thread, lifecycle
-- matches the thread exactly, no FK gymnastics, no second-table RLS to
-- author. Cheap and reversible.
ALTER TABLE chat_threads
  ADD COLUMN draft_spec jsonb;

COMMENT ON COLUMN chat_threads.draft_spec IS
  'In-progress DigestSpecDraft for the config agent. NULL = no draft yet. Cleared on successful confirm_and_save.';
