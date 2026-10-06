<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Grant or refund credits

## When to use this
Make good for a failed brief, thank a design partner, or test billing by granting credits to one user. When not to: Stripe-paid refunds after checkout goes live (refund in Stripe first, then the webhook deducts), and never by editing `users.credits_balance` directly.

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Admin access | Your e-mail is in `CADENCE_ADMIN_EMAILS` (Vercel) | The admin pages load |
| The user exists and is not deleted | Find the user on the admin users page | One row |

## Steps
1. Grant: open the admin users page, find the user, open "Grant credits", enter a whole number from 1 to 1000 and a note, submit.
   Expected: the new balance shows; a `transactions` row with `type = 'admin_grant'` exists. Re-submitting the same open form does not grant twice (the form's `grantId` is the idempotency key, `server/billing/grant.ts`).
2. Refund a failed run: open the admin runs page, select the failed run, choose "Refund".
   Expected: the amount mirrors the original charge, or the run's resolved tier if nothing was charged (`resolveRefundAmount`, lesson L-14); a `type = 'refund'` row; a refund e-mail is sent. A second refund of the same run returns `already_refunded`.

## Verification
The user's ledger on the admin users page shows the new row and the balance changed by exactly the granted or refunded amount.

## Rollback
1. A mistaken grant is not deleted: record the correction with a note and tell the owner; a negative adjustment needs a code change (there is no admin "debit" form today).

## Last run
Not recorded in the repository.
