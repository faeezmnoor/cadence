---
status: accepted
date: 2026-06-19
decision-makers: the owner (ruled by owner)
---
<!-- layer: knowledge · status: frozen · verified: 2026-10-06 · budget: 80 lines -->
# Record architecture & product decisions as ADRs

Original status line: accepted. Original date line: 2026-06-19.

## Context and problem statement
Cadence's locked decisions lived only in Notion's Decisions Log (`D-NNN`). Agents can't read Notion offline or when the MCP is down, which caused drift (e.g. a doc claimed an eval gate that was never in code). Decisions need a home agents can read *inline*, that is diffable and survives context loss.

## Considered options
- A. Keep decisions only in the Notion Decisions Log (status quo).
- B. Make docs/decisions/ in the repo the canonical record (chosen).

## Decision outcome
The repo's **`docs/decisions/`** is the canonical, machine-readable record for product + architecture decisions, in MADR-lite format (`NNNN-title.md`). Numbering mirrors the Notion `D-NNN` 1:1 (ADR 0001 ↔ D-001) for traceability; each ADR's frontmatter notes its `notion:` id. ADRs are **immutable** — never deleted, never rewritten after `accepted`; status flips to `superseded by NNNN` / `reversed` instead. Notion keeps a human-facing **index** that links to each ADR.

## Consequences
- Offline/Notion-down agents have the full decision context.
- One numbering scheme; the `cadence-deliver` CLOSE phase (via `cadence-bookkeeper`) keeps the Notion index in sync.
- A plan that changes a decision must add a new ADR — decisions are never edited in place.
- Lifecycle: `proposed → accepted → (superseded by NNNN | reversed | deprecated)`.
