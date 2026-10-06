---
status: accepted
date: 2026-06-16
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Maintain a pluggable web-search registry; Standard default is eval-decided

Former id: D-011 (retired Notion log). Original status line: accepted. Original date line: 2026-06-16 (amended 2026-06-18).

## Context and problem statement
Standard ran a single web-search provider on a grandfathered free Brave key — a single point of failure. Cadence also wants provider choice for Custom mode.

## Considered options
- A. A single web-search provider (the grandfathered Brave key).
- B. A pluggable registry with the Standard default chosen by eval (chosen).

## Decision outcome
Maintain the **full registry** of pluggable `Searcher` providers (Brave + DuckDuckGo, Tavily/CAD-229, Serper/CAD-230, Searxng, GDELT). **Which provider is the Standard default is decided by eval** (provider-selection eval CAD-232), not pre-committed; Brave is the current default until an eval selects otherwise.

**Amendment 2026-06-18 (CAD-165):** the per-brief provider picker is exposed to **all** users (a brief's Advanced tab), not gated to Custom. **DuckDuckGo** shipped as the keyless reliability fallback (removes the Brave SPOF); the pipeline auto-falls back to DDG on provider error. Shipped via PR #49. Registry: `server/ai/providers/searchers.ts`; migration `0031`.

## Consequences
Tracking epic CAD-228; default-selection eval CAD-232 lands before GA.
