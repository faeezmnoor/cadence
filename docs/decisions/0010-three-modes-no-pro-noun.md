# 0010 — Research is three modes (Standard / Advanced / Custom); "Pro" is retired

- Status: accepted
- Date: 2026-06-14
- notion: D-010

## Context
"Pro tier" framing collided with the credit-pack named "Pro" and implied a subscription plan, violating ADR 0002's credits-only model.

## Decision
The product offers three research **modes**: **Standard** (1cr, default stack), **Advanced** (5cr, higher-investment stack), **Custom** (user-selected stack + BYO keys/LLMs/channels; Phase 5.2, deferred). **"Pro" is retired — never use it in any user-facing form** ("Pro tier/plan/brief/toggle"). Credit-pack display names = **Taste / Everyday / Power / Max** (internal `packId`s `taste/standard/power/pro` stay code-only). Only retained internal token: the `PRO_TIER_ALPHA` flag / `tier` DB column (never user-facing).

## Consequences
Copy says "standard/advanced/custom research". Advanced's honesty caveat (ADR 0007) applies — don't market it as already much better.
