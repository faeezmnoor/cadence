<!-- layer: knowledge · status: living · verified: 2026-10-06 -->
# Runbook — Stripe SKUs v2 — credit-pack-only runbook

## When to use this
Create the four Stripe credit-pack products and wire checkout once Malaysian KYC clears. When not to: before KYC clears (docs/OWNER-QUEUE.md OQ-07), or to change prices without changing apps/web/server/billing/packs.ts in the same change.

## Preconditions
| Needs | Check | Expected |
| --- | --- | --- |
| Stripe MY KYC cleared | Stripe dashboard → Settings → Business | Verified |
| Pack figures match code | `cd apps/web && npx vitest run test/stripe-skus-runbook.test.ts` | exit 0 |

## Steps
The original procedure follows; its sections are nested one level down. Updated 2026-10-06 (slice 001, fix round 1): pack display names and the Advanced price follow decisions 0008 and 0010, which win over any older wording here. Display names are Taste, Everyday, Power and Max (`PACK_LABELS` in apps/web/server/billing/packs.ts); the `packId` values `taste`, `standard`, `power`, `pro` stay code-only and in Stripe metadata. Never name a Stripe product "Pro" anything (decision 0010).
> **Stripe credit-pack SKU spec** — the implementation runbook the owner follows once Stripe MY KYC clears. This repo is canonical (companions: `docs/_archive/2026-10/HANDOVER.md` §6, `apps/web/server/billing/`).


**Status:** Canonical SKU shape for Cadence Stripe Checkout. Implementation BLOCKED on the owner's MY KYC clearance.
**Last updated:** 2026-06-10 (CAD-204 — Wave 6 Phase 4).
**Mirrored to:** `cadence/app/docs/stripe-skus-v2.md` (read-only).
**Supersedes:** any prior "Pro plan tier" / subscription framing. Cadence has NO plan tiers, only credit packs.

---

### TL;DR

Cadence bills in **pre-paid credits**. There are no subscriptions, no plan tiers, no recurring charges. The Stripe side is **4 one-time products**, one per credit pack. The "advanced research stack" is a per-brief credit-cost multiplier inside the app, not a separate SKU on the Stripe side.

This runbook is the **manual dashboard setup checklist** the owner follows post-KYC. The Cadence codebase does NOT mutate Stripe products — every product in the dashboard is created by the owner by hand from this doc, then the IDs are pasted into Vercel env. This keeps Stripe-side state under human review and out of agentic code paths.

---

### Hard constraints (do NOT relax without explicit owner approval)

1. **No subscriptions.** Every product MUST be one-time (`Type: One-time`). If you see "Recurring" in the dashboard form, you're on the wrong screen.
2. **No tiered pricing.** Each pack is a single fixed price. Stripe's "Tiered pricing" model is for graduated/volume pricing on a single product; we don't use it.
3. **No "plan" / "tier" nouns** in product names, descriptions, or metadata. The user never sees "Pro" in any form; the 1000-credit pack is the "Max pack" (a credit-pack name, not a tier; decision 0010). Internal `tier` enum in Postgres stays (`standard | advanced`) and refers to the **research stack**, not a billing tier.
4. **USD primary, MYR display only.** Charge USD; convert MYR for display at the FX snapshot stored in `pricing_snapshots`. MY-native MYR settlement is a v2 KYC-clearance milestone, not v1.
5. **Webhook secret rotates with KYC migration.** When KYC clears, generate a fresh `STRIPE_WEBHOOK_SECRET` and rotate; do NOT reuse a test-mode secret in prod.

---

### The 4 SKUs (canonical shape)

The numbers MUST match `apps/web/server/billing/packs.ts` exactly. If they ever diverge, the code is wrong — update Stripe first (rare) OR ship a forward migration that writes a new row to `pricing_snapshots` (preferred).

| Pack | Stripe product name | Stripe description | Credits granted | USD price | MYR display | $/credit | Notes |
|---|---|---|---|---|---|---|---|
| `taste` | **Cadence — Taste pack** | 30 briefs delivered. No subscription, credits never expire. | 30 | $5.00 | RM 23.00 | $0.167 | Entry tier. |
| `standard` | **Cadence — Everyday pack** | 70 briefs delivered. No subscription, credits never expire. Best value for daily readers. | 70 | $10.00 | RM 47.00 | $0.143 | Highlighted `best_value` on `/pricing`. |
| `power` | **Cadence — Power pack** | 200 briefs delivered. No subscription, credits never expire. | 200 | $25.00 | RM 118.00 | $0.125 | Power-user tier. |
| `pro` | **Cadence — Max pack** | 1000 briefs delivered. No subscription, credits never expire. | 1000 | $100.00 | RM 470.00 | $0.10 | Highest-volume pack. Internal id `pro` only; display name Max (decision 0010). |

> **Naming hazard.** The pack with internal id `pro` is the $100 / 1000-credit credit pack, displayed as "Max". It is NOT the Advanced research mode (that costs 5 credits per brief instead of Standard's 1, inside the app, gated by `digest_specs.tier='advanced'`; decision 0008). Receipts should say "Max pack" so customers don't think they bought a subscription; "Pro" never appears in any user-facing form (decision 0010).

All 4 packs clear the 60% gross-margin floor at the v1 cost-to-us estimate of $0.005/credit (see `COST_TO_US_MICRO_PER_CREDIT_V1` in `packs.ts`).

---

### Required product metadata (on every product)

Set these on every Stripe product so the webhook can route credit grants without ambiguity:

```
pack_id              taste | standard | power | pro
credits_granted      30 | 70 | 200 | 1000
sku_version          v1
cadence_environment  prod | test
```

The webhook handler will read `pack_id` from `checkout.session.metadata.pack_id` (set at session-create time by Cadence) AND verify it matches `line_items[0].price.product.metadata.pack_id` before crediting. Defense in depth.

---

### Setup checklist — for the owner post-KYC

Run through this from top to bottom in the **test** dashboard first. Only after the test-mode end-to-end works (signup → checkout → webhook → credit balance increment → receipt email lands), repeat against prod.

#### A. Stripe account hygiene
- [ ] MY KYC fully cleared (business verification done, settlement bank account confirmed).
- [ ] Statement descriptor set to `CADENCE` (max 22 chars).
- [ ] Branding: logo uploaded (square Cadence wordmark), brand color set to `#ff6b4a` (coral accent).
- [ ] Receipt emails enabled in **Settings → Customer emails**: tick "Successful payments" AND "Refunds".
- [ ] Tax behavior: set products to **Tax inclusive: No** (we charge USD net; tax handled per-region via Stripe Tax when we enable it later).

#### B. Products + prices (do 4 times, one per pack)
For each row in the SKU table above:
- [ ] **Products → Add product**
- [ ] Name: `Cadence — <Pack name> pack`
- [ ] Description: from the table above
- [ ] Image: Cadence wordmark (same square asset for all 4 — keep brand consistent)
- [ ] **Pricing**:
  - Pricing model: **Standard pricing**
  - Price: USD `<price from table>`
  - Billing: **One time** (NOT Recurring)
- [ ] **Metadata** (add the 4 keys from the metadata section)
- [ ] Save product
- [ ] Copy the **Price ID** (looks like `price_1Q...`)

#### C. Wire to Vercel
Set these env vars in **Vercel → Project → Cadence → Environment Variables** (Production + Preview):

```
STRIPE_SECRET_KEY            sk_live_...            # rotate test/prod separately
STRIPE_WEBHOOK_SECRET        whsec_...              # fresh per environment
STRIPE_PRICE_TASTE           price_...              # from step B
STRIPE_PRICE_STANDARD        price_...
STRIPE_PRICE_POWER           price_...
STRIPE_PRICE_PRO             price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  pk_live_...
```

Redeploy after env changes.

#### D. Webhook endpoint
- [ ] **Developers → Webhooks → Add endpoint**
- [ ] URL: `https://cadence-web-bice.vercel.app/api/stripe/webhook` (replace with custom domain once `cadence.news` is live)
- [ ] Events to subscribe (minimum viable):
  - `checkout.session.completed` — primary credit-grant trigger
  - `charge.refunded` — webhook-driven credit deduction on refunds
  - `payment_intent.payment_failed` — log + Sentry (no user-visible impact, retry handled by Stripe)
- [ ] Copy signing secret → `STRIPE_WEBHOOK_SECRET` (per env)
- [ ] **Send test webhook** for `checkout.session.completed` from the dashboard. Verify it shows `200` in the delivery log AND the user's `credits_balance` ticks up in Supabase.

#### E. Test end-to-end (test mode)
- [ ] Use test card `4242 4242 4242 4242` (any future expiry, any 3-digit CVC, any postcode).
- [ ] Buy Taste pack → check Supabase `users.credits_balance` increments by 30 → check `transactions` row with `type='topup'` and `stripe_session_id` populated → check receipt email arrived.
- [ ] Buy Everyday pack while logged in as same user → balance should be 100 (30 + 70). Verify idempotency: replay the same webhook delivery from the Stripe dashboard and confirm balance does NOT double-increment (the `transactions_stripe_session_id_uq` UNIQUE index is the fence).
- [ ] Refund the Everyday pack from Stripe dashboard → confirm 70 credits get deducted via `charge.refunded` handler → confirm ledger row `type='refund'` is written.

#### F. Flip live
- [ ] Repeat steps B+C+D against the **live** dashboard.
- [ ] Toggle Vercel env from test secrets → live secrets in **Production** only (keep Preview on test).
- [ ] Smoke: do a real $5 Taste purchase from your own account. Confirm everything matches the test run.
- [ ] On `/settings/billing`, the pack tiles flip from "Top-ups arrive when Stripe MY clears" to actionable Checkout buttons. This switch is hardcoded today; ship a one-line flag flip when ready (probably `STRIPE_LIVE=true`).
- [ ] Update `/pricing` copy if any "coming soon" framing remains.

---

### What the codebase currently has (and what it doesn't)

**Has:**
- `apps/web/server/billing/packs.ts` — canonical SKU constants (matches this doc)
- `apps/web/server/db/schema.ts` — `transactions.stripe_session_id` (UNIQUE partial index for webhook idempotency)
- `apps/web/server/email/receipt-template.ts` — pure-function receipt renderer, ready to wire to a sender
- `apps/web/server/billing/{debit,refund,low-balance-footer}.ts` — credit ledger + Telegram low-balance nudges
- `apps/web/server/trpc/routers/billing.ts` — read-only balance + ledger query for `/settings/billing`
- `apps/web/app/settings/billing/billing-client.tsx` — UI tiles with "Top-ups arrive when Stripe MY clears" tooltip

**Does NOT have (intentionally — comes online post-KYC):**
- `stripe` npm dependency
- `apps/web/app/api/stripe/webhook/route.ts` — webhook handler
- `apps/web/server/billing/stripe.ts` — Stripe client + `createCheckoutSession()`
- Live env vars in Vercel for any `STRIPE_*` key
- Any Stripe-mutating API call anywhere in the codebase

When you wire it up, the file shapes above are the natural next-PR scope. Do NOT pre-create them as empty stubs — keep the code surface clean until the integration is ready to ship in one reviewable commit.

---

### Manual steps the owner owes (post-merge of PR #11, NOT in this PR)

1. **Stripe MY KYC clearance.** Single biggest blocker. Until KYC clears, nothing in this runbook runs.
2. **Walk the setup checklist above** in test mode first, then prod.
3. **Add `stripe` dep + ship the webhook + Checkout PR.** Estimate: 1 PR, ~300 LOC across `stripe.ts` (client + createCheckoutSession), `/api/stripe/webhook/route.ts` (signature verify + credit grant + refund handling), `billing-client.tsx` (Checkout button wire-up), tests for idempotency. Out of scope for PR #11.
4. **Update `/settings/billing` "Top-ups arrive when Stripe MY clears" copy** to live Checkout buttons. One-line flag flip + tooltip removal.
5. **Decide MYR-native settlement timing.** Stripe MY supports MYR native settlement; v1 charges in USD with FX display only. MYR native is a v2 milestone — needs the owner's MY business bank account + Stripe MY MYR settlement opt-in. Not blocking GA.

---

### Open questions (low priority, not blocking)

- **Pack lineup tweak after first 50 paying users?** If `taste` 30-credit users churn before `standard` upsell, consider collapsing `taste` and pricing `standard` at $7 / 50 credits. Defer until we have data.
- **Auto-topup at $3 / $5 balance threshold?** Per monetization-strategy-v1 §8, v1.5 ship. Needs a saved payment method, which adds a SCA-friendly flow. Out of scope for v1.
- **Promo code support at Checkout?** Stripe supports promo codes out-of-the-box. Enable when we run our first paid acquisition campaign — until then, manual `admin_grant` via `/admin` is the documented path.

---

### Why this runbook lives in `cadence/blueprint/` and not just in code

Per `feedback_cadence_blueprint_canonical.md`: `cadence/blueprint/` is the canonical planning layer; `cadence/app/docs/` is a read-only mirror. Stripe dashboard setup is a **manual, one-way, KYC-gated** operation that sits above the code — putting it in the blueprint forces it to stay in sync with strategy decisions (pricing, copy, channels) and out of the daily code-review noise.

When you next change pack pricing or add a pack, edit THIS file first, then update `packs.ts`, then update the live Stripe dashboard. In that order.

## Verification
```
cd apps/web && npx vitest run test/stripe-skus-runbook.test.ts
```
Expected: exit 0; and the test-mode end-to-end in section E passes.

## Rollback
1. In Vercel, switch Production back to the test-mode Stripe variables and redeploy; archive (do not delete) any live product created in error.
2. Credits already granted by a live webhook are reversed only through refunds (`charge.refunded`), never by editing the ledger.

## Last run
Never run: blocked on KYC (2026-10-06).
