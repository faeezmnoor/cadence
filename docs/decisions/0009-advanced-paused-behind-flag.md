---
status: accepted
date: 2026-06-14
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Advanced tier paused behind PRO_TIER_ALPHA

Former id: D-009 (retired Notion log). Original status line: accepted (gate threshold superseded by ADR 0012). Original date line: 2026-06-14.

## Context and problem statement
Advanced is engineering-complete but not proven better on the metric that matters. Shipping it publicly before it clears the eval gate would over-promise.

## Considered options
- A. Ship Advanced publicly now.
- B. Keep Advanced paused behind `PRO_TIER_ALPHA` until the eval gate clears (chosen).

## Decision outcome
Advanced stays **paused behind the `PRO_TIER_ALPHA` flag** (admin-grant only). The un-pause gate lives in `apps/web/server/evals/pro-eval-gate.ts`. Founder `/admin` ratings are the final authority on flipping it.

## Consequences
Cron silently downgrades Advanced→Standard while paused. The exact threshold is **`MIN_LEAD = 0.5`** per ADR 0012 (this ADR's original "0.25 + specificity ≥ 3.7" wording was never in code and is retired).
