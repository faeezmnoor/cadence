# 0004 — Brief-creation flow: starter cards + "Browse all briefs" gallery

- Status: accepted (shipped)
- Date: 2026-06-11
- notion: D-004

## Context
The first chat turn needs to show what Cadence can do without a form, and scale past a handful of hard-coded example pills.

## Decision
Turn-0 shows **3 starter cards** + a **"Browse all briefs" gallery**; templates are config-file seeded (provenance tracked). No modal; the chat escape hatch keeps parity.

## Consequences
Shipped via CAD-211/212/22/24/25; template provenance lives in `server/ai/config-agent/template-seed.ts`. Design rationale: `proposals/brief-creation-flow-proposal.md`.
