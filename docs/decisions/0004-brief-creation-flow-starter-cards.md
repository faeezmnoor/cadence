---
status: accepted
date: 2026-06-11
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Brief-creation flow: starter cards + "Browse all briefs" gallery

Former id: D-004 (retired Notion log). Original status line: accepted (shipped). Original date line: 2026-06-11.

## Context and problem statement
The first chat turn needs to show what Cadence can do without a form, and scale past a handful of hard-coded example pills.

## Considered options
- A. A handful of hard-coded example pills.
- B. A modal.
- C. Three starter cards plus a "Browse all briefs" gallery (chosen).

## Decision outcome
Turn-0 shows **3 starter cards** + a **"Browse all briefs" gallery**; templates are config-file seeded (provenance tracked). No modal; the chat escape hatch keeps parity.

## Consequences
Shipped via CAD-211/212/22/24/25; template provenance lives in `server/ai/config-agent/template-seed.ts`. Design rationale: `proposals/brief-creation-flow-proposal.md`.
