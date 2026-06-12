# Migration 0029 — branch-DB rehearsal checklist (ship operator)

Status: **NOT yet rehearsed against a database.** This environment has no
`DATABASE_URL` and no local Postgres, so only the structural invariants are
CI-tested (`test/manage-mode-migration-0029.test.ts`). The behavioural
fixtures from the plan (§6 migration row) MUST be rehearsed on a Supabase
branch DB before the pre-merge prod apply. Do NOT run any phase against prod
until every step below passes on the branch DB.

All commands run from `apps/web/` with `DATABASE_URL` pointing at the
**branch** DB (e.g. `node --env-file=.env.branch server/db/apply-0029.mjs`).

## 1. Seed fixtures (psql against the branch DB)

Create one user, then:

- **Happy path:** thread T1 (status `completed`) with an assistant
  `chat_messages` row whose `content` carries `"savedSpecId": "<spec A id>"`;
  spec A owned by the user, status `active`.
- **jsonb-null fixture (advisory 7):** thread T2 with an assistant message
  whose content is `{"savedSpecId": null}` (jsonb null, not SQL null).
- **Ambiguity (a) — thread saved two specs:** thread T3 with TWO assistant
  savedSpecId messages (spec B older, spec C newer). Expect T3 binds to C.
- **Ambiguity (b) — two threads saved one spec:** threads T4 (older
  message) and T5 (newer message) both carrying spec D. Expect T5 wins,
  T4 stays unbound and is printed as a skipped candidate.
- **Ownership:** thread T6 carrying a savedSpecId owned by a DIFFERENT user.
  Expect unbound.
- **Archived spec:** thread T7 bound (via backfill) to spec E with
  status `archived`.
- **Reactivation NOT-EXISTS skip:** after phase 1, manually insert an
  ACTIVE thread T8 with `spec_id = <spec A id>` (simulates a user
  lazy-creating between deploy and phase 2).
- **Two-completed-threads convergence (exec CTO R1, post-rollback shape):**
  threads T9 and T10 BOTH `completed` and bound to live spec F (give T10
  the newer `updated_at`; equal timestamps are also worth running — that is
  exactly what `--phase=rollback` produces, since it stamps one shared
  `now()` — the `id DESC` tiebreak still picks exactly one). This simulates
  deploy → lazy-create T10 → rollback → reactivate.

## 2. Phase 1 — schema

```
node --env-file=.env.branch server/db/apply-0029.mjs --phase=schema
```

Expect:
- columns `chat_threads.spec_id`, `users.last_sample_dry_run_at` verified;
  indexes `idx_chat_threads_spec`, `chat_threads_spec_active_uq` verified.
- `status counts unchanged` printed (the script fails hard otherwise).
- T1→A, T3→C, T5→D bound; T2, T4, T6 unbound; T4/T6 listed as skipped
  candidates.
- **Run it a second time:** prints `0 changes (idempotent re-run)`.

## 3. Phase 2 — reactivate

```
node --env-file=.env.branch server/db/apply-0029.mjs --phase=reactivate
```

Expect:
- T1 (live spec, no active sibling) flips to `active`.
- T8's spec (A) — wait: T8 IS the active sibling for spec A, so T1 must be
  **skipped** by the NOT EXISTS guard if T8 was inserted first. Run the
  fixture both ways: with T8 present (T1 skipped, counted in the skip
  count) and without (T1 reactivated).
- T7 (archived spec) stays `completed`.
- **Spec F (CTO R1 fixture):** exactly ONE of T9/T10 flips to `active`
  (T10 — newest `updated_at`, or highest id on a timestamp tie); the other
  stays `completed` and is counted as skipped. The statement must NOT abort
  with a `chat_threads_spec_active_uq` violation — that abort is the exact
  pre-fix failure this fixture pins.
- **Run it a second time:** prints `0 changes` (the reactivated T10 now
  trips the NOT EXISTS guard for spec F — converges instead of aborting).

## 4. Phase 3 — rollback

```
node --env-file=.env.branch server/db/apply-0029.mjs --phase=rollback
```

Expect: every spec-bound `active` thread (T1, the manually inserted T8, and
the reactivated T10) back to `completed`; second run prints `0 changes`.
Then run `--phase=reactivate` once more: spec F is now back in the
two-completed-threads shape with EQUAL `updated_at` stamps — exactly one of
T9/T10 must reactivate (no abort), proving rollback → reactivate round-trips.

## 5. Prod sequence (plan §7.1)

1. Pre-flight spot-check on prod:
   `SELECT count(*) FROM chat_messages WHERE role='assistant' AND content ? 'savedSpecId';`
   — record the count in the PR (sparse is fine; lazy-create covers gaps).
2. **Pre-merge:** `--phase=schema` against prod. Record bound/skipped counts
   in the PR.
3. **Post-deploy** (new code serving, `MANAGE_MODE` on): `--phase=reactivate`.
   Record reactivated/skipped counts in the PR thread.
4. `--phase=rollback` is ONLY for emergency revert (must run BEFORE any
   post-reactivation `git revert` — plan §7.2).

Never `db:push`.
