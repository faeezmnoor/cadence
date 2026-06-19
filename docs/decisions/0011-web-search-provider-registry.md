# 0011 — Maintain a pluggable web-search registry; Standard default is eval-decided

- Status: accepted
- Date: 2026-06-16 (amended 2026-06-18)
- notion: D-011

## Context
Standard ran a single web-search provider on a grandfathered free Brave key — a single point of failure. Cadence also wants provider choice for Custom mode.

## Decision
Maintain the **full registry** of pluggable `Searcher` providers (Brave + DuckDuckGo, Tavily/CAD-229, Serper/CAD-230, Searxng, GDELT). **Which provider is the Standard default is decided by eval** (provider-selection eval CAD-232), not pre-committed; Brave is the current default until an eval selects otherwise.

**Amendment 2026-06-18 (CAD-165):** the per-brief provider picker is exposed to **all** users (a brief's Advanced tab), not gated to Custom. **DuckDuckGo** shipped as the keyless reliability fallback (removes the Brave SPOF); the pipeline auto-falls back to DDG on provider error. Shipped via PR #49. Registry: `server/ai/providers/searchers.ts`; migration `0031`.

## Consequences
Tracking epic CAD-228; default-selection eval CAD-232 lands before GA.
