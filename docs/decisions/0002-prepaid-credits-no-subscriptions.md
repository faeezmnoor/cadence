# 0002 — Monetization: pre-paid credits, no subscriptions

- Status: accepted (pricing details amended by ADR 0006/0008)
- Date: 2026-06-02 (amended 2026-06-14)
- notion: D-002

## Context
Subscriptions over-promise for a periodical product and add churn mechanics that fight the wedge. Cadence needs usage-aligned billing with ≥60% gross margin.

## Decision
**Pre-paid credits, no subscriptions, credits never expire.** 1 credit = 1 Standard brief. `/tune` + feedback taps are free forever (protect the self-learning loop). Trial = 3 free credits, granted once after the first brief delivery.

## Consequences
Credits are the only billing primitive — no plan tiers. The advanced-brief credit cost and pack names are set in ADR 0008/0010 (this ADR's original "3 credits = advanced" is superseded by ADR 0006/0008's 5-credit ruling).
