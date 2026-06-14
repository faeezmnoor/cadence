-- 0029b: reactivate backfilled manage threads (brief manage mode, phase 2 of 2).
--
-- POST-DEPLOY ONLY (exec RC1/RC4): run via apply-0029.mjs --phase=reactivate
-- strictly AFTER Vercel is serving the new code with MANAGE_MODE on. Running
-- this while legacy code is live would let the setup agent resume these
-- threads (confirm_and_save -> archive-and-replace hazard, plan §4.1).
--
-- Reactivate backfilled threads whose brief is still live so they resume as
-- manage threads ('completed' stays legacy-terminal otherwise).
-- NOT EXISTS guard: a user may have lazy-created an active manage thread for
-- this spec between deploy and this script — skip those specs (their legacy
-- thread stays completed; history preserved) instead of violating
-- chat_threads_spec_active_uq. Idempotent: a second run matches zero rows
-- (every reactivated thread now trips its own NOT EXISTS guard).
--
-- One-per-spec subselect (exec PR review round 1, CTO R1): a spec can carry
-- TWO completed bound threads — deploy → lazy-create active T2 (backfilled
-- T1 stays completed) → --phase=rollback (T2 → completed). The NOT EXISTS
-- guard evaluates against the pre-statement snapshot, so without the
-- subselect the UPDATE would try to activate BOTH rows and abort on
-- chat_threads_spec_active_uq. The subselect activates exactly one row per
-- spec: most-recent updated_at wins; t3.id DESC is the deterministic
-- tiebreak (rollback stamps one shared now() across every row it touches,
-- so updated_at alone can tie exactly).
UPDATE chat_threads t
SET status = 'active', updated_at = now()
FROM digest_specs s
WHERE t.spec_id = s.id AND t.status = 'completed'
  AND s.status IN ('active','paused')
  AND NOT EXISTS (SELECT 1 FROM chat_threads t2
                  WHERE t2.spec_id = t.spec_id AND t2.status = 'active')
  AND t.id = (SELECT t3.id FROM chat_threads t3
              WHERE t3.spec_id = t.spec_id AND t3.status = 'completed'
              ORDER BY t3.updated_at DESC, t3.id DESC
              LIMIT 1);
