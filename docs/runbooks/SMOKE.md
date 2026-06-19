# SMOKE — self-dogfooded smoke spec (T-306 / CAD-41)

Cadence runs a continuous, self-dogfooded smoke test against the Phase 3
delivery infra (tz cron + idempotency + retry + auto-heal + admin viewer).
The smoke contract is: **one `digest_spec` owned by the founder, marked
`is_smoke=true`, delivered daily to a Telegram chat at a low-volume hour.**
A second cron summarises the last 24h every morning. After **3 consecutive
clean summaries**, the delivery layer is considered trustworthy enough to
onboard real users.

## Contract

| Field | Value |
| --- | --- |
| Owner email (default) | `faeezmnoor@gmail.com` |
| Telegram chat id (default) | `27643893` |
| Cadence | daily |
| Delivery time | `06:30` Asia/Kuala_Lumpur (intentionally before the 07:00 MYT live-commerce brief, so we don't clash with it) |
| Topic | AI agent UX patterns / OpenAI / Anthropic — low-volume, reliably non-empty |
| Marker | `digest_specs.is_smoke = true` |
| Summary time | daily at `09:00` MYT (`0 1 * * *` UTC) |
| Summary target | the same Telegram chat |

Override via env at seed time: `SMOKE_OWNER_EMAIL`, `SMOKE_TELEGRAM_CHAT_ID`,
`SMOKE_DELIVERY_TIME_LOCAL`, `SMOKE_TIMEZONE`.

## Seeding the smoke spec

The seed script is idempotent — re-run after every deploy:

```sh
DATABASE_URL=... node apps/web/scripts/seed-smoke-spec.mjs
```

Dry run (no writes) for verification:

```sh
DATABASE_URL=... node apps/web/scripts/seed-smoke-spec.mjs --dry-run
```

Exit codes:
- `0` — smoke spec ensured
- `1` — misconfiguration (missing env)
- `2` — owner email not yet in `users` (magic-link sign in first, then re-run)

## Day-0 baseline

Right after seeding, run the verifier:

```sh
DATABASE_URL=... node apps/web/scripts/verify-smoke-spec.mjs
```

Asserts:
1. Exactly one `is_smoke=true is_current=true` spec exists for the owner.
2. The owner has `telegram_chat_id` set and `state='active'`.
3. The tz-aware cron matcher would fire the spec within the next 24h.

Exit non-zero on any failure — safe to gate a deploy step on it.

## Reading the daily summary

Every day at 09:00 MYT the `smoke-summary` Inngest function posts a block
like:

```
Cadence smoke summary
window: 2026-06-02T01:00:00.000Z -> 2026-06-03T01:00:00.000Z (UTC)
smoke specs: 1

[OK] faeezmnoor@gmail.com
  spec: <uuid>
  runs: 1/1 expected
  delivered=1 failed=0 pending=0 retried=0
  user.state: active
  latency: p50=4321ms p99=4321ms
```

Status prefix:
- `[OK]` — expected == actual AND no `delivery_broken` AND no row had
  `attempt_count > 2`.
- `[ALERT]` — anything else. Investigate before counting the day as clean.

Investigation cheat sheet:
- `actual = 0` → cron didn't fire. Check `digest_runs` table, the
  cron-dispatch Inngest function logs, and that user.state is `active`.
- `failed > 0` → check `last_error` in the summary block, then the
  `digest_runs` row for the full error.
- `retried > 0` → the retry path engaged. Acceptable if attempt_count <= 2;
  alert if higher.
- `user.state = delivery_broken` → auto-heal hasn't fired. Phase 3 auto-heal
  flips back to `active` on the next successful delivery. If we're stuck
  broken, T-305 admin replay will be needed.

## Kill switches

**Pause the smoke without deleting the spec** (recommended — preserves the
spec for fast re-arm):

```sql
UPDATE digest_specs
SET is_smoke = false, updated_at = now()
WHERE is_smoke = true;
```

Effect: the next daily summary will report `smoke specs: 0` and skip
sending to Telegram. The spec stays current and will keep delivering
briefs as a normal user spec until you also flip `is_current=false`.

**Full kill** (no more briefs at all):

```sql
UPDATE digest_specs
SET is_smoke = false, is_current = false, updated_at = now()
WHERE is_smoke = true;
```

Or pause the user:

```sql
UPDATE users
SET state = 'paused', updated_at = now()
WHERE lower(email) = 'faeezmnoor@gmail.com';
```

(`state != 'active'` makes the cron dispatcher skip the user entirely.)

**Re-arm**:

```sh
DATABASE_URL=... node apps/web/scripts/seed-smoke-spec.mjs
DATABASE_URL=... node apps/web/scripts/verify-smoke-spec.mjs
```

## 3-day clean criteria

Smoke is "done" when:
1. Three consecutive daily summaries report `[OK]`.
2. No manual intervention (no migration replays, no user-state flips, no
   manual Inngest replays) inside that window.
3. The latency p99 stays below the per-tier budget defined in the digest
   pipeline (currently ~30s end-to-end is the working ceiling).

Hitting all three unlocks Phase 4 user onboarding.
