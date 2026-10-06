---
status: accepted
date: 2026-06-14
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Pricing: Standard 1 credit, Advanced 5 credits

Former id: D-008 (retired Notion log). Original status line: accepted. Original date line: 2026-06-14.

## Context and problem statement
With tiers cut to two (ADR 0006), the per-brief credit cost must reflect measured cost-to-us while keeping "1 credit = 1 brief" canonical.

## Considered options
- A. The original "3 credits = advanced" (ADR 0002).
- B. Standard 1 credit, Advanced 5 credits (chosen).

## Decision outcome
**Standard = 1 credit/brief; Advanced = 5 credits/brief.** "1 credit = 1 brief" is canon. No cost ceiling on research stacks — quality decides; measured per-brief cost feeds the per-stack credit price. Code-canonical in `apps/web/lib/research-stack.ts` (`STACK_COSTS`).

## Consequences
Pack display names + the "never Pro" vocabulary are set in ADR 0010. Supersedes the original "3 credits = advanced" line in ADR 0002.
