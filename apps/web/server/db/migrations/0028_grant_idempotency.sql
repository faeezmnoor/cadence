-- Review CTO P2-2: grantCredits idempotency must hold under concurrency.
--
-- The in-transaction check-before-insert in server/billing/grant.ts is a
-- fast path, not a guarantee — two concurrent grants with the same grantId
-- can both pass the SELECT (READ COMMITTED) and both insert, double-
-- crediting the balance. This partial unique index makes the database the
-- arbiter: the second INSERT conflicts and grant.ts treats the conflict as
-- duplicate=true (onConflictDoNothing + empty RETURNING → rollback of the
-- balance bump).
--
-- Partial: only admin_grant rows that actually carry a grantId participate,
-- so charges/topups/refunds (no grantId) and legacy grant rows (if any
-- predate the grantId scheme) never collide.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_admin_grant_grant_id_uq
  ON public.transactions ((metadata ->> 'grantId'))
  WHERE type = 'admin_grant' AND metadata ->> 'grantId' IS NOT NULL;
