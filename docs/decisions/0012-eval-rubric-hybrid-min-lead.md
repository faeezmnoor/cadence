# 0012 — Eval rubric is hybrid; gate threshold is MIN_LEAD = 0.5

- Status: accepted
- Date: 2026-06-14 (reconciled to code 2026-06-16)
- notion: D-012

## Context
Docs had drifted to a false eval gate ("0.25 + specificity ≥ 3.7") that was never in code. Source of truth is `apps/web/server/evals/pro-eval-gate.ts`; where docs disagreed with code, code won.

## Decision
**Rubric is hybrid:** only the **3-axis composite (grounding / specificity / fit)** gates; the 5 axes (accuracy/depth/actionability/freshness/readability) are **diagnostic-only**, never gating. **Gate threshold = `MIN_LEAD = 0.5`** (absolute Advanced − Standard composite lead), ≥5 ratings/arm, trailing 7-day window. No separate specificity bar, no "mean+1σ". The Haiku judge stays **log-only** until Spearman ρ ≥ 0.7 + quadratic-weighted κ ≥ 0.6/axis over ≥50 paired ratings, then becomes the volume scorer with human spot-check at gates.

## Consequences
The 2026-06 campaign measured Advanced's lead at **+0.26 < 0.5** → Advanced is **not yet gate-ready**; closing that gap is open product work. No subsystem change ships without a move-or-hold eval verdict (G-eval). Plan: `docs/plans/eval-harness-upgrade.md`.
