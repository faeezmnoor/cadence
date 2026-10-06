---
name: cadence-eval
description: Run or extend a Cadence subsystem golden set and print the metric delta — the G-eval mechanism (move-or-hold before VERIFY). Use when a change touches research, retrieval, composer, provider, channel, content format or self-learning code, or to grow eval coverage. Owned by cadence-eval-quality.
---

# /cadence-eval — the G-eval mechanism

Produces the verdict that gates VERIFY: **did the subsystem metric move or hold?** Gate definition: docs/workflow.md "G-eval" and decision 0012; subsystems: docs/architecture/overview.md "Subsystems".

## Subsystem golden sets and metrics
| Subsystem | Golden set | Metric |
|---|---|---|
| research-search | query → expected sources | recall / precision / freshness |
| retrieval-consolidation | raw bundle → expected ranked and de-duplicated set | duplicate rate, salience@k |
| llm-composer | spec + sources → scored output | composite (grounding, specificity, fit; gates) + 5 diagnostic scores, faithfulness, length |
| multi-llm-provider | spec across models | quality per dollar, p50/p95 latency |
| channels-delivery | composed brief → per-channel render | delivery success, render fidelity |
| content-format | structured brief → rendered artifact | fidelity, cost per asset, latency |
| self-learning | feedback history → distilled preferences | personalisation lift, distill stability |

## Steps
1. **Identify** the subsystem and its golden set under `apps/web/server/eval/` (today only the feedback and extractor evals exist — the per-subsystem framework is **net-new; build it** as you go). The Advanced gate is `apps/web/server/evals/pro-eval-gate.ts` — `eval/` (singular, golden sets) versus `evals/` (plural, release gate); don't write to the wrong folder (lesson L-18).
2. **Baseline.** Record the current metric on the golden set before the change.
3. **Run** the golden set against the change (preview deployment or local). Scorer tiers: deterministic → LLM judge (Haiku, log-only unless validated) → blinded human (the owner) for release gates.
4. **Verdict.** Print: metric, baseline, new value, threshold, **PASS (moved or held) / FAIL (regressed)**. A FAIL blocks VERIFY. Record it in the slice's notes.md.
5. **Extend coverage.** If the change adds behaviour, add golden-set cases so future changes are guarded.

## Guardrails
- No subsystem ships on impression — produce a number.
- Register the win criterion before a bake-off (CAD-222 discipline). Keep judges blinded.
- Composer and Advanced changes also respect the Advanced release gate (`READY`) and the dogfood bar (CAD-209) as hard release blockers.
