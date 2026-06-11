# Cadence Platform Audit & Joint Ship Proposal — 2026-06-11

**Process:** 4-agent board — Senior PM + Senior SWE independent audits → CPO + CTO challenge rounds (claims re-verified in code) → joint CPO×CTO negotiation. All findings cite file:line, verified this date against `main`.
**Status:** Awaiting founder approval. Nothing below is implemented.

---

## A. Verified P0 findings (CTO re-confirmed each in code)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| P0-1 | **Advanced-research tier's research is dead code.** `providers.search` (Perplexity) has zero call sites; sources are gathered via Brave before tier resolution. Every 3-credit brief = standard sources + Sonnet + sharper prompt. The eval gate compares prompts, not stacks. | `server/ai/providers/index.ts:32-47`, `run.ts:241-249` vs `:375-446` | Product integrity (no paying users yet — bug, not bleed) |
| P0-2 | **Cost telemetry is fiction.** `composerInput.digestRunId` stays `null` → all composer cost_events unattributed → `costToUsMicroUsdForRun` always returns the $0.005 fallback → margin numbers are a constant and the Pro cost circuit breaker can never trip. `params.digestRunId` is already in scope — fix is threading a variable. | `run.ts:369` vs `:449`, `cost.ts:82-105`, `circuit-breaker.ts:87` | Economics blind |
| P0-3 | **Multi-brief composes the wrong spec.** Dispatcher claims runs per-spec; pipeline ignores the claimed `spec_id` and re-resolves `is_current limit(1)` (no orderBy). Compounding (PM): `saveSpecForUser` archives the current spec on every save — creating brief #2 silently kills brief #1 while `/briefs` sells "X of 5". | `cron-dispatch.ts:131-143`, `run.ts:186-196`, `save-spec.ts:38-46` | Data loss + wrong deliverable |
| P0-4 | **Any late cron tick silently bricks a schedule forever.** `shouldFire` requires exact-minute equality; `next_run_at` advances only on successful claim; no reconciliation; failed briefs have no user surface and no Sentry capture. (Worse than first reported — not just >5-min outages.) | `evaluator.ts:89`, `cron-dispatch.ts:65-81,157-162`, `run.ts:606-657` | Silent churn machine |
| P0-5 | **The marketed self-learning wedge is half-dead.** 👍/👎 votes stop at `feedback_events` (admin eval only) — they never reach `learning_log`, the distill, or any future brief. Free-text replies are dropped at `MSG_UNKNOWN`. Only `/tune` teaches. Landing, toasts, and `MSG_LINKED` all promise otherwise. | `feedback-callback.ts:81-91`, `weekly-distill.ts:124-132`, `dispatch.ts:138-139` | Marketed promise currently false |

Additional confirmed: scraper price data truncated out of prompts on busy days (head-slice ordering); `sources.prices` block never populated; sample brief carries no feedback keyboard and debits a trial credit (2-3 day runway into a mailto wall); 5 of 10 starter chips are GA-excluded categories; the entire pipeline runs in one Inngest `step.run` with no `maxDuration` (Vercel timeout cliff × paid retries); Perplexity's synthesized answer is discarded (bare URLs kept); Anthropic prompt caching unused; every-minute dispatcher ≈ 43k Inngest runs/mo; credit ledger has no backup (free-tier Supabase, no PITR); refuted en route: a naive `*/5` dispatcher would break all non-:00/:05 delivery times.

## B. Negotiation outcomes (6 tensions, all settled)

1. **Cost attribution (T1):** ships Wave 1 (it's an S that gates all economics); votes-wiring jumps ahead of it.
2. **Spec hydration (T2):** ships Wave 1 — the founder's own dogfood requires 2 concurrent specs, making the bug reachable on day one. 1-brief server-side gate for partners (founder exempt at 2).
3. **Advanced tier (T3):** product-paused NOW (hidden, 3-credit spends blocked, historical Advanced spends credited back, Perplexity code frozen not deleted) → Wave 3 bake-off: Perplexity-wired (A1+A2) vs Anthropic native web-search (A3), 10×10 briefs, A3 wins ties, un-pause only on ≥0.5 composite at ≤$0.10/brief, loser deleted same week. No Pro upsell UI before the gate passes.
4. **/pause /resume (T4):** internal spec pause/break states ship inside the P0-3 work; in-bot commands stay cut (deep-link to web).
5. **Wave order (T5):** honesty + correctness floor → reliability + visible learning → quality + tier verdict.
6. **Gates (T6):** dogfood = 14 days, 2 specs, ≥7 days post-Wave-1; failed days count as data (clock never resets). Eval = 25 rated briefs, ≥50% post-Wave-1, founder ratings capped at 60%, Advanced briefs excluded until un-paused.

## C. The roadmap (12 items, 3 waves)

### Wave 1 — this week (~2 founder-days): start the gate clock honestly
1. **Wire 👍/👎 → learning_log** (S) — votes persist with brief fingerprint; first vote visible in next brief's feedback block.
2. **Honest-copy + 1-brief gate day** (XS-S) — server-side gate in `saveSpecForUser`; fix MULTI_TOPIC_REFUSAL / MSG_LINKED / MSG_UNKNOWN / "X of 5" / pricing-KYC line; sample-debit skip; "self-learning" out of new acquisition copy until #1 verified.
3. **P0-2 cost attribution** (S) — thread digestRunId/userId into composer + Brave cost events; manual path pre-insert.
4. **P0-3 spec hydration + pause states** (S) — pipeline loads spec from the claimed run; exhaustion pauses SPEC, permanent Telegram error breaks USER; archived specs recoverable.
5. **Credit bridge + Advanced pause** (S) — admin_grant partners a Taste-equivalent today; credit back historical 3-credit spends; hide/block Advanced; "Request credits" → founder Telegram ping, 24h SLA.
6. **Nightly pg_dump** (S) — ledger gets an offsite copy; one tested restore.

### Wave 2 — next: briefs arrive, learning is visible
7. **Scheduler resilience rewrite** (M) — windowed due-check replaces exact-minute match; advance-on-skip; daily reconciliation; Sentry in pipeline catch; then dispatcher `*/5`.
8. **Delivery-failure surface + resurrection** (M) — user-facing "brief failed, retrying"; no silent non-delivery, ever.
9. **Pipeline survivability** (S-M) — split into gather/compose/deliver steps + maxDuration; deterministic citation-parity repair; compose-only retry.
10. **Learning loop closes** (M) — free sample WITH feedback keyboard; reply-to-brief capture (matched to `telegram_message_id`, Yes/No confirm — injection guard); event-triggered distill (≥3 signals or 72h).

### Wave 3 — after the gates are running: quality + tier verdict
11. **Recall pack + entity retrieval** (S-M, $0 COGS) — Google News RSS per entity/keyword; interleave/dedup/48h freshness; entity-aware search queries. Fixes competitor-watch (the weakest ICP at 45%). Rider if slack: GA-excluded chip swap (poultry/feed-corn, competitor-watch, LHDN chips; `gaExcluded` flag keeps telemetry stable).
12. **Pro integrity bake-off → tier decision** (M, ≤$20) — criterion pre-registered above; one research vendor survives.

### Not doing (with consent of both execs)
`*/5` standalone · in-bot /pause /resume · L3 structured-prefs routing · L4 regenerate gate · paid Brave (trigger: key death or revenue) · agentic loop / GDELT / DDG / SearXNG · prompt-caching & parallelization polish (backlog) · multi-brief engine + marketing (out until P0-3 proven live) · share-link on samples · lowConfidence footer · self-serve credits · timezone capture (unless a non-MY partner joins).

## D. Founder asks (only Faeez)

1. Run the dogfood with 2 specs, 14 days, vote on everything (first real data through the learning pipe; live test of P0-3).
2. Push Stripe KYC to completion.
3. Rate briefs within 24h; get both partners rating too (gate needs ≥50% post-Wave-1, founder capped at 60%).
4. Approve spend posture: $0 new now; pre-approve ~$20 for the Wave 3 bake-off; paid Brave only on trigger.
5. Send the partner honesty note + credit grant today (sample's free, credits granted, Advanced paused while we verify it, reply to any brief to tune it).

## E. Risk register

1. Wave 1 = 6 items in ~2 days → batch by surface (1+2 one sitting; 3+4 one sitting; 5 mostly admin; 6 a cron line). Slip #6 first, never #1/#4.
2. Scheduler failures during first dogfood week (rewrite is Wave 2) → daily manual `next_run_at` check; failed days count as data, never reset the clock.
3. Prompt injection via free-text → only structured votes write to the log until item 10's confirm-gate ships.
4. Bake-off ambiguity → criterion pre-registered; no renegotiation at decision time.
5. n=2 is too thin to "prove" self-learning → the gate tests mechanism honesty, not statistics; acquisition claims stay mechanism-level until >5 users.
