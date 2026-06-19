# 0009 — Advanced tier paused behind PRO_TIER_ALPHA

- Status: accepted (gate threshold superseded by ADR 0012)
- Date: 2026-06-14
- notion: D-009

## Context
Advanced is engineering-complete but not proven better on the metric that matters. Shipping it publicly before it clears the eval gate would over-promise.

## Decision
Advanced stays **paused behind the `PRO_TIER_ALPHA` flag** (admin-grant only). The un-pause gate lives in `apps/web/server/evals/pro-eval-gate.ts`. Founder `/admin` ratings are the final authority on flipping it.

## Consequences
Cron silently downgrades Advanced→Standard while paused. The exact threshold is **`MIN_LEAD = 0.5`** per ADR 0012 (this ADR's original "0.25 + specificity ≥ 3.7" wording was never in code and is retired).
