# Changelog
<!-- layer: records · status: record · verified: 2026-11-17 -->

All notable user-visible changes to Cadence are recorded here. Format: [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/); commits follow [Conventional Commits](https://www.conventionalcommits.org/). Pre-GA this is a single root changelog; switch to [changesets](https://github.com/changesets/changesets) if a package is ever published. The bookkeeper adds one dated entry per merged slice at CLOSE, newest first.

## 2026-11-17 — request guards for the Zod advisory (PR #58)

### Security
- **Request size limits before parsing:** chat requests are refused above 1 MiB and API requests above 384 KiB with 413 before any schema check runs; a chat message too long to send gets a plain message and no retry. Addresses GHSA-mrhx-c7xc-m3w5 (decision 0013, option B; the Zod 4 upgrade stays on the roadmap).
- **Input checks:** the chat message shape is checked before the model is called (at most 200 messages); the API input decoder refuses malformed annotations before validation; error responses carry a bounded number of issues and no stack trace.

### Changed
- Scheduling rules bound `weekdays` (at most seven) and `skipDates` (at most 366).

## 2026-06-19 — agent-dev operating system (PR #50)

### Added
- **Agent-dev operating system:** `AGENTS.md` (tool-agnostic core) + lean `CLAUDE.md` `@import`; `docs/decisions/` ADRs mirroring Notion `D-001..D-012`; per-ticket plan template (`docs/plans/_TEMPLATE.md`) + archive-on-ship lifecycle; automated `phase:close` in the delivery workflow; `cadence-cofounder` orchestrator agent.
- **DuckDuckGo** as a registered, selectable web-search provider with per-brief picker + keyless auto-fallback (CAD-165, ADR 0011).

### Changed
- **Copy-honesty pass:** removed banned terms; Advanced research framed as *specificity + fit*, never "deep research" (CAD-234, ADR 0007).
- Repo consolidated to a single `main`; 25 stale docs removed; operational runbooks grouped under `docs/runbooks/`.

### Removed
- The "watch" standing-config rename — D-005 **reversed**; CAD-227 cancelled. "brief" stays the noun for both the standing config and the delivered artifact (ADR 0005).
