<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Grant or refund credits

## When to use this
Make good for a failed brief, thank a design partner, or test billing by granting credits to one user. When not to: never by editing `users.credits_balance` directly. For Stripe-paid refunds after checkout goes live, follow step 4.

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Admin access | Your e-mail is in `CADENCE_ADMIN_EMAILS` (Vercel) | The admin pages load |
| The user exists and is not deleted | Find the user on the admin users page | One row |

## Steps
The steps below are the archived handover's §8 "Manually grant credits / refund a user", verbatim (docs/_archive/2026-10/HANDOVER.md).
1. `/admin` → user lookup by email or telegram_chat_id.
2. "Grant credits" form → enter integer + reason → writes `transactions(type='admin_grant', credits_delta=+N, metadata={reason})`.
3. Refund: same form with `credits_delta=-N` + `type='refund'`. UI confirms; ledger reconciles.
4. For Stripe-cleared refunds (post-KYC), do the Stripe-side refund first, then admin_grant compensating credits.

Current admin pages (read from the code on 2026-10-06). They differ from step 3: the grant form takes positive amounts only, so a refund goes through the run refund below.
- Grant: open the admin users page, find the user, open "Grant credits", enter a whole number from 1 to 1000 and a note, submit.
  Expected: the new balance shows; a `transactions` row with `type = 'admin_grant'` exists. Re-submitting the same open form does not grant twice (the form's `grantId` is the idempotency key, `server/billing/grant.ts`).
- Refund a failed run: open the admin runs page, select the failed run, choose "Refund".
  Expected: the amount mirrors the original charge, or the run's resolved tier if nothing was charged (`resolveRefundAmount`, lesson L-14); a `type = 'refund'` row; a refund e-mail is sent. A second refund of the same run returns `already_refunded`.

## Verification
The user's ledger on the admin users page shows the new row and the balance changed by exactly the granted or refunded amount.

## Rollback
1. A mistaken grant is not deleted: record the correction with a note and tell the owner; a negative adjustment needs a code change (there is no admin "debit" form today).

## Last run
Not recorded in the repository.
