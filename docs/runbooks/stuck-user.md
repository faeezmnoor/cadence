<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Investigate a stuck or broken user

## When to use this
A user reports no brief, the smoke summary shows `[ALERT]`, or a run is `failed`. When not to: a platform-wide outage (start from Sentry and the Inngest dashboard instead).

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Admin access | The admin runs page loads | Run list |
| Sentry access | Search by the user id tag | Events or none |

## Steps
1. Open the admin runs page and filter to the user; read the last runs and their status.
2. If a run is `failed`, read its `last_error` (sanitised) and the Sentry event tagged with the user id; errors are classed transient, permanent or unknown (`server/digest/errors.ts`).
3. If the user is `delivery_broken` (repeated Telegram send failures), the usual cause is that the user blocked or left the bot (inferred from the archived handover); once they unblock, the next successful delivery heals the state automatically.
4. If the composer's JSON failed repeatedly (`ComposerJsonError`), the run already retried three times; treat persistent failures as model-output drift and open a slice (composer rules: .claude/rules/llm-composer.md).
5. To re-run a delivery after fixing the cause, use "Replay" on the run (`admin.replayRun`).

## Verification
The replayed or next scheduled run shows `delivered` on the admin runs page, and the user confirms receipt.

## Rollback
Nothing to roll back: the steps only read state or replay a run. Refund a failed run if the user expected a brief (docs/runbooks/grant-credits.md).

## Last run
Not recorded in the repository.
