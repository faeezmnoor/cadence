---
status: accepted
date: 2026-06-13
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Research tiers reduced to two (Standard + Advanced)

Former id: D-006 (retired Notion log). Original status line: accepted. Original date line: 2026-06-13.

## Context and problem statement
Three depth options existed, including a 3-credit "Pro/Perplexity Sonar" middle tier (internally A2). Evals showed A2 grounded *worse* than free Standard at 3× the price — strictly dominated.

## Considered options
- A. Three depths, including the 3-credit middle tier (A2).
- B. Two depths, Standard and Advanced (chosen).

## Decision outcome
Two depths only: **Standard** (1 credit; Haiku + gathered sources) and one **Advanced** (5 credits; Sonnet 4.6 + native web-search). The 3-credit middle option is **retired from the product** (DB migration `0030`). (ADR 0010 adds **Custom** as a third *mode*, not a fixed tier.)

## Consequences
No 3-credit option exists. Pricing fixed in ADR 0008; vocabulary in ADR 0010.
