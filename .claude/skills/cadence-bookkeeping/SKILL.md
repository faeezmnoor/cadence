---
name: cadence-bookkeeping
description: Sync a body of Cadence work across Linear (source of truth), Notion (PM mirror), ticket-map.json (offline cache), and Claude memory. Use when closing a phase, filing an epic + children, or updating status after a build wave. Claude-Code-native port (Linear + Notion via MCP).
---

# Cadence Bookkeeping — Linear + Notion + ticket-map + memory

## When to use
You shipped or planned work that must be reflected across all four systems: Linear, Notion, `ticket-map.json`, and memory.

## Recipe (Claude Code on this Mac — MCP, not the OpenClaw `ntn`/cron path)
1. **Linear first (source of truth).** Use the Linear MCP. Create the epic if new (title, description, team **CAD** for Cadence — never LWL, labels). Create children with explicit `parentId`, acceptance criteria, related files, test plan. Status moves: `Backlog → Todo → In Progress → In Review → Done`.
2. **Notion mirror.** Use the Notion MCP. Update the Cadence Engineering Backlog under the "📡 Startup - Cadence" tree. The `Status` is a `status`-type property (not `select`). Mirror epic → child rows with Linear URL, Status, Phase, Owner.
3. **`ticket-map.json`** (repo root: `/Users/faeez/dev/projects/cadence/ticket-map.json`). **Create it if it doesn't exist yet**, otherwise update each ticket's state; keep ordering by ticket number. This is the offline cache other sessions read as a Linear fallback.
4. **Memory.** If the work changed a strategic stance, add/update a `cadence-*` memory file under `~/.claude/projects/-Users-faeez-dev-projects/memory/` and add a one-line entry to `MEMORY.md` (link + ≤10-word hook).
5. **Verify.** Print the Linear epic URL, Notion page URL, and updated `ticket-map.json` counts.

## Pitfalls
- Notion `Status` as `select` → property-type mismatch. It's a `status` property.
- Filing tickets without acceptance criteria — the next agent won't know what "done" means.
- Forgetting the `MEMORY.md` index entry — orphaned memory is invisible memory.
- Cross-project leakage — Cadence = CAD team + Cadence Notion subtree only. Never mix with LiveWheel.
- If the Linear/Notion MCP is disconnected, update `ticket-map.json` + memory now and flag the Linear/Notion sync as pending.
