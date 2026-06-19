---
name: cadence-handover
description: Build a cold-pickup artifact set (README / CLAUDE.md / ARCHITECTURE.md / HANDOVER.md) for a Cadence scope so a new session is productive in under 30 minutes. Use after a major phase lands, on ownership transfer, or when agents keep losing context. Claude-Code-native port.
---

# Cadence Handover Artifact Wave — README + CLAUDE.md + ARCHITECTURE.md

## When to use
A scope (project, phase, subsystem) needs a cold-pickup artifact set. Triggered after a major phase lands, on ownership transfer, or when sessions keep getting confused about context.

## Recipe (Claude Code on this Mac)
1. **Scope the artifacts:**
   - `README.md` — external-facing: what is this, how to run it. Repo root.
   - `CLAUDE.md` — agent-facing rules: hard walls, never-do, scope. Scope root.
   - `ARCHITECTURE.md` / `HANDOVER.md` — diagram + per-layer responsibilities + glossary (HANDOVER for state-heavy scopes).
2. **Mine canonical sources** (in order): repo `CLAUDE.md`, `docs/AGENT_TEAM.md`, `HANDOVER.md`, `apps/web/server/ARCHITECTURE.md`, the Notion Cadence tree (via MCP), the Linear `CAD-` board (recent epic + in-flight), last 5 commits. Cite paths.
3. **Structure each artifact:** TL;DR first (read-this-if-nothing-else, 5–10 min), numbered sections with a reading-time estimate, a Mermaid diagram for ARCHITECTURE/HANDOVER, a glossary (every term used >twice), and a "known pitfalls — if you see X, do Y" section near the end.
4. **Cross-link:** absolute repo paths; Linear tickets as `CAD-N`; Notion pages as full URLs.
5. **Verify discoverability:** add a one-line pointer in the scope's `CLAUDE.md`. If it duplicates an existing doc, retire one — don't keep both.

## Pitfalls
- Essay prose — cold readers skim. Use tables, lists, headers, code blocks.
- Stale at write-time — verify each claim against current code/Linear; mark uncertain items "**flag for verification**".
- Skipping the glossary (DigestSpec / composer / Pro tier / G-eval become the #1 confusion source).
- Putting agent-rules in README (that's for humans; CLAUDE.md is for agents).
- Omitting the pitfalls section — it's the most valuable part for the next session.
