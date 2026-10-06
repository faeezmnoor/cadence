---
status: accepted
date: 2026-06-14
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Research is three modes (Standard / Advanced / Custom); "Pro" is retired

Former id: D-010 (retired Notion log). Original status line: accepted. Original date line: 2026-06-14.

## Context and problem statement
"Pro tier" framing collided with the credit-pack named "Pro" and implied a subscription plan, violating ADR 0002's credits-only model.

## Considered options
- A. "Pro tier" framing.
- B. Three research modes, Standard, Advanced and Custom, with "Pro" retired (chosen).

## Decision outcome
The product offers three research **modes**: **Standard** (1cr, default stack), **Advanced** (5cr, higher-investment stack), **Custom** (user-selected stack + BYO keys/LLMs/channels; Phase 5.2, deferred). **"Pro" is retired — never use it in any user-facing form** ("Pro tier/plan/brief/toggle"). Credit-pack display names = **Taste / Everyday / Power / Max** (internal `packId`s `taste/standard/power/pro` stay code-only). Only retained internal token: the `PRO_TIER_ALPHA` flag / `tier` DB column (never user-facing).

## Consequences
Copy says "standard/advanced/custom research". Advanced's honesty caveat (ADR 0007) applies — don't market it as already much better.
