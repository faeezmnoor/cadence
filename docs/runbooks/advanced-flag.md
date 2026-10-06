<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Turn Advanced research on or off

## When to use this
Expose or pause the Advanced research mode (5 credits) for every user. When not to: before the eval gate reports ready (decisions 0009, 0012); the owner decides.

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Gate verdict | Admin evals page → gate verdict (`server/evals/pro-eval-gate.ts`) | `READY=true` |
| Owner ruling | A decision record allowing the switch | Present in docs/decisions/ |
| Vercel access | Vercel → Project → Settings → Environment Variables | Page opens |

## Steps
1. Set `PRO_TIER_ALPHA=true` in Vercel (Production). Only `1` or `true` count as on; anything else is off (`isProTierAlpha()` in `apps/web/lib/feature-flags.ts`).
2. Redeploy production.
   Expected: the deployment shows "Ready"; the Advanced choice appears on a brief's settings.

## Verification
Create or switch a test brief to Advanced and trigger a sample: the run's metadata shows `tier.resolved = "pro_websearch"` and the ledger charges 5 credits.

## Rollback
1. Unset `PRO_TIER_ALPHA` (or set it to `false`) and redeploy. Specs saved as Advanced are downgraded to Standard before composing and are charged 1 credit; nothing is stranded.

## Last run
Not recorded in the repository; Advanced has been paused since 2026-06-14 (decision 0009).
