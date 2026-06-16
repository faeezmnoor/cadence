---
name: cadence-eval
description: Run or extend a Cadence subsystem golden set and print the metric delta — the G-eval mechanism (move-or-hold before VERIFY). Use when a change touches research/retrieval/composer/provider/channel/content/self-learning, or to grow eval coverage. Owned by cadence-eval-quality.
---

# /cadence-eval — the G-eval mechanism

Produces the verdict that gates VERIFY: **did the subsystem metric move-or-hold?** See `docs/AGENT_TEAM.md` §3A.

## Subsystem golden sets & metrics
| Subsystem | Golden set | Metric |
|---|---|---|
| research-search | query → expected sources | recall / precision / freshness |
| retrieval-consolidation | raw bundle → expected ranked/deduped | dedup rate, salience@k |
| llm-composer | spec+sources → scored output | composite (grounding/specificity/fit, gates) + 5 diagnostic sub-scores, faithfulness, length |
| multi-llm-provider | spec across models | quality-per-dollar, p50/p95 latency |
| channels-delivery | ComposedBrief IR → per-channel render | delivery success, render fidelity |
| content-format | structured brief → rendered artifact | fidelity, $/asset, latency |
| self-learning | feedback history → distilled prefs | personalization lift, distill stability |

## Steps
1. **Identify** the subsystem + golden set under `apps/web/server/eval/` (today only feedback + extractor evals exist — the per-subsystem golden-set framework is **net-new; build it** as you go). The Pro gate is at `apps/web/server/evals/pro-eval-gate.ts` — note the `eval/` (singular, golden sets) vs `evals/` (plural, Pro gate) distinction; don't write to the wrong dir.
2. **Baseline.** Record the current metric on the golden set (the pre-change number).
3. **Run** the golden set against the change (preview deploy or local). Scorers in tiers: deterministic → LLM-judge (Haiku, log-only unless validated) → blinded human (Faeez) for release gates.
4. **Verdict.** Print: metric, baseline, new value, threshold, **PASS (moved-or-held) / FAIL (regressed)**. A FAIL blocks VERIFY.
5. **Extend coverage.** If the change introduces a new behavior, add golden-set cases so future changes are guarded.

## Guardrails
- No subsystem ships on vibes — produce a number.
- Pre-register the win criterion for bake-offs (CAD-222 discipline). Keep judges blinded.
- Composer/Pro changes also respect the Pro eval gate (`READY` flag) + the dogfood bar (CAD-209) as hard release blockers.
