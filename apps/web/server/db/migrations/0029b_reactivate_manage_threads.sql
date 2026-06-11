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
UPDATE chat_threads t
SET status = 'active', updated_at = now()
FROM digest_specs s
WHERE t.spec_id = s.id AND t.status = 'completed'
  AND s.status IN ('active','paused')
  AND NOT EXISTS (SELECT 1 FROM chat_threads t2
                  WHERE t2.spec_id = t.spec_id AND t2.status = 'active');
