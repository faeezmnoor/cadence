# Changelog

All notable user-visible changes to Cadence are recorded here. Format: [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/); commits follow [Conventional Commits](https://www.conventionalcommits.org/). Pre-GA this is a single root changelog; switch to [changesets](https://github.com/changesets/changesets) if a package is ever published. The `cadence-deliver` CLOSE phase appends entries here automatically.

## [Unreleased]

### Added
- **Agent-dev operating system:** `AGENTS.md` (tool-agnostic core) + lean `CLAUDE.md` `@import`; `docs/decisions/` ADRs mirroring Notion `D-001..D-012`; per-ticket plan template (`docs/plans/_TEMPLATE.md`) + archive-on-ship lifecycle; automated `phase:close` in the delivery workflow; `cadence-cofounder` orchestrator agent.
- **DuckDuckGo** as a registered, selectable web-search provider with per-brief picker + keyless auto-fallback (CAD-165, ADR 0011).

### Changed
- **Copy-honesty pass:** removed banned terms; Advanced research framed as *specificity + fit*, never "deep research" (CAD-234, ADR 0007).
- Repo consolidated to a single `main`; 25 stale docs removed; operational runbooks grouped under `docs/runbooks/`.

### Removed
- The "watch" standing-config rename — D-005 **reversed**; CAD-227 cancelled. "brief" stays the noun for both the standing config and the delivered artifact (ADR 0005).
