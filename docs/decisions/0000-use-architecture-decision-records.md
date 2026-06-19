# 0000 — Record architecture & product decisions as ADRs

- Status: accepted
- Date: 2026-06-19
- Deciders: Faeez

## Context
Cadence's locked decisions lived only in Notion's Decisions Log (`D-NNN`). Agents can't read Notion offline or when the MCP is down, which caused drift (e.g. a doc claimed an eval gate that was never in code). Decisions need a home agents can read *inline*, that is diffable and survives context loss.

## Decision
The repo's **`docs/decisions/`** is the canonical, machine-readable record for product + architecture decisions, in MADR-lite format (`NNNN-title.md`). Numbering mirrors the Notion `D-NNN` 1:1 (ADR 0001 ↔ D-001) for traceability; each ADR's frontmatter notes its `notion:` id. ADRs are **immutable** — never deleted, never rewritten after `accepted`; status flips to `superseded by NNNN` / `reversed` instead. Notion keeps a human-facing **index** that links to each ADR.

## Consequences
- Offline/Notion-down agents have the full decision context.
- One numbering scheme; the `cadence-deliver` CLOSE phase (via `cadence-bookkeeper`) keeps the Notion index in sync.
- A plan that changes a decision must add a new ADR — decisions are never edited in place.
- Lifecycle: `proposed → accepted → (superseded by NNNN | reversed | deprecated)`.
