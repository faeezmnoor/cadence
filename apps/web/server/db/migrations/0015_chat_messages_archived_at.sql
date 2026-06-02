-- T-413 / CAD-73: Soft-archive chat messages on conversation reset.
--
-- Reset semantics: user wants a clean slate but we keep the row history for
-- debugging + future "show prior conversations" UX. Adding archived_at is
-- non-destructive, reversible, and indexable later if read volume demands.
--
-- listMessages and /chat hydration filter on archived_at IS NULL.
-- chat.resetThread sets archived_at = now() for all rows on a thread and
-- clears chat_threads.draft_spec.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN chat_messages.archived_at IS
  'Set on conversation reset (T-413). NULL = visible. Non-NULL = hidden from /chat hydration.';
