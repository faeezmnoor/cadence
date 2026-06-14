-- 0029: chat_threads ↔ digest_specs binding (brief manage mode, phase 1 of 2).
--
-- SCHEMA PHASE ONLY — applied to prod BEFORE merge (exec RC1/RC4). This file
-- deliberately contains NO UPDATE of chat_threads.status: reactivating
-- backfilled threads while legacy code is live would let the setup agent
-- (confirm_and_save -> saveSpecForUser archive-and-replace at cap) resume
-- them. Reactivation is the separate post-deploy phase 2
-- (0029b_reactivate_manage_threads.sql, run via apply-0029.mjs
-- --phase=reactivate only after the new code is serving with MANAGE_MODE on).
--
-- Forward-safe with live legacy code: nullable column + partial indexes;
-- legacy code never reads spec_id, and no thread's status changes, so legacy
-- /chat resolution behavior is byte-identical.
--
-- Idempotent: ADD COLUMN/CREATE INDEX IF NOT EXISTS; the backfill UPDATE
-- only touches rows with spec_id IS NULL, so a second run is a no-op.

-- 1. Column + FK. ON DELETE SET NULL: a dangling manage thread degrades
--    to setup, never errors. NOTE (documented in ARCHITECTURE.md, work
--    item 8): specs are archived, never hard-deleted today — if a future
--    feature hard-deletes specs, SET NULL silently turns a manage thread
--    into a setup thread carrying full manage history. Acceptable now; do
--    not let a delete feature trip over it unknowingly.
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS spec_id uuid REFERENCES digest_specs(id) ON DELETE SET NULL;

-- 2. Lookup index for /chat?brief=<id> resolution.
CREATE INDEX IF NOT EXISTS idx_chat_threads_spec
  ON chat_threads (spec_id) WHERE spec_id IS NOT NULL;

-- 3. Backfill with a two-sided ambiguity rule (PM risk 7):
--    (a) per THREAD: if a thread saved multiple specs historically, it binds
--        to its LATEST savedSpecId only;
--    (b) per SPEC: if multiple threads saved the same spec, the MOST RECENT
--        thread wins (prereq for the unique index in step 4).
--    Ownership cross-checked via digest_specs.user_id. Losers are logged by
--    the apply script, then covered by lazy-create.
--    Note: content->>'savedSpecId' returns SQL NULL for jsonb null, so
--    {"savedSpecId": null} rows are correctly skipped with no extra
--    predicate (pinned by a migration-test fixture; see
--    scripts/REHEARSAL-0029.md for the branch-DB rehearsal checklist).
WITH per_thread AS (
  SELECT DISTINCT ON (m.thread_id)
         m.thread_id, (m.content->>'savedSpecId')::uuid AS sid, m.created_at
  FROM chat_messages m
  WHERE m.role = 'assistant' AND m.content->>'savedSpecId' IS NOT NULL
  ORDER BY m.thread_id, m.created_at DESC
), per_spec AS (
  SELECT DISTINCT ON (sid) thread_id, sid
  FROM per_thread
  ORDER BY sid, created_at DESC
)
UPDATE chat_threads t
SET spec_id = b.sid
FROM per_spec b
WHERE t.id = b.thread_id
  AND t.spec_id IS NULL
  AND EXISTS (SELECT 1 FROM digest_specs s
              WHERE s.id = b.sid AND s.user_id = t.user_id);

-- 4. Invariant: at most ONE live manage thread per brief (lazy-create race
--    guard). INVARIANT NOTE (exec advisory 9): this index is provably safe
--    to create here only because (a) the per-spec DISTINCT ON rule in step 3
--    binds at most one thread per spec, and (b) at phase-1 time every bound
--    thread is still status='completed' (reactivation is phase 2), so the
--    partial predicate matches zero backfilled rows. A future edit to the
--    backfill MUST preserve the one-thread-per-spec rule or this CREATE
--    fails / the reactivation phase conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_spec_active_uq
  ON chat_threads (spec_id) WHERE spec_id IS NOT NULL AND status = 'active';

-- 5. Per-user dry-run sample throttle ledger (exec RC6, plan §4.5). One
--    nullable column; RLS-neutral (only the service-role core touches it).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_sample_dry_run_at timestamptz;

COMMENT ON COLUMN chat_threads.spec_id IS
  'Manage-mode binding to digest_specs. NULL = setup thread. ON DELETE SET NULL degrades a manage thread to setup (specs are archive-only today).';
COMMENT ON COLUMN users.last_sample_dry_run_at IS
  'Atomic claim timestamp for the 60s chat-origin dry-run sample throttle (exec RC6).';
