---
name: cadence-bookkeeping
description: Sync a body of Cadence work across Linear (source of truth), Notion (PM mirror), ticket-map.json (offline cache), and Claude memory. Use when closing a phase, filing an epic + children, or updating status after a build wave. Claude-Code-native port (Linear + Notion via MCP).
---

# Cadence Bookkeeping — Linear + Notion + ticket-map + memory

## When to use
You shipped or planned work that must be reflected across systems: Linear, Notion, `CHANGELOG.md`, the `docs/decisions/` index, the plan archive, `ticket-map.json`, and memory. **This skill is the CLOSE-phase mechanism — the `/cadence-deliver` workflow invokes it automatically after SHIP (`phase:close`), so these updates happen without a separate prompt.**

## Recipe (Claude Code on this Mac — MCP, not the OpenClaw `ntn`/cron path)
1. **Linear first (source of truth).** Use the Linear MCP. Create the epic if new (title, description, team **CAD** for Cadence — never LWL, labels). Create children with explicit `parentId`, acceptance criteria, related files, test plan. Status moves: `Backlog → Todo → In Progress → In Review → Done`.
2. **Notion mirror.** Use the Notion MCP. Update the Cadence Engineering Backlog under the "📡 Startup - Cadence" tree. The `Status` is a `status`-type property (not `select`). Mirror epic → child rows with Linear URL, Status, Phase, Owner.
3. **`ticket-map.json`** (repo root: `/Users/faeez/dev/projects/cadence/ticket-map.json`). **Create it if it doesn't exist yet**, otherwise update each ticket's state; keep ordering by ticket number. This is the offline cache other sessions read as a Linear fallback.
4. **CHANGELOG.** Append the shipped change to `CHANGELOG.md` under `## [Unreleased]` using Keep a Changelog categories (Added/Changed/Deprecated/Removed/Fixed/Security). One line per user-visible change, referencing `CAD-N` + PR.
5. **Decisions + plan archive.** If a decision changed or was added, ensure the ADR exists in `docs/decisions/` (immutable; new ADR — never edit an accepted one) and refresh the Notion Decisions-index links. Archive the shipped plan: `docs/plans/CAD-N.md` → `docs/plans/_archive/` with header `> SHIPPED <date> | PR #N | CAD-N`.
6. **Memory.** Refresh the `cadence-*` primers under `~/.claude/projects/-Users-faeez-dev-projects/memory/` — **capped, summary-only, regenerated from `HANDOVER.md`** (never a parallel source of truth). A new strategic stance → add/update a file + a one-line `MEMORY.md` index entry (link + ≤10-word hook).
7. **Verify.** Print the Linear URL, Notion URL, updated `ticket-map.json` counts, and the archived plan path.

## Pitfalls
- Notion `Status` as `select` → property-type mismatch. It's a `status` property.
- Filing tickets without acceptance criteria — the next agent won't know what "done" means.
- Forgetting the `MEMORY.md` index entry — orphaned memory is invisible memory.
- Cross-project leakage — Cadence = CAD team + Cadence Notion subtree only. Never mix with LiveWheel.
- If the Linear/Notion MCP is disconnected, update `ticket-map.json` + memory now and flag the Linear/Notion sync as pending.
