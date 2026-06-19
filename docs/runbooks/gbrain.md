# Runbook — gbrain (semantic code/knowledge retrieval)

gbrain is a local persistent brain (PGLite or Supabase) exposed to agents as an MCP tool: semantic code search (`gbrain search`, `code-def`, `code-refs`) + cross-session recall of plans/retros/decisions. It is the **deep-retrieval layer** — it complements, never replaces, `docs/` + Linear + Notion.

## When to adopt
Adopt when grep/glob start failing you — i.e. the codebase is large enough that an agent burns real time re-reading `ARCHITECTURE.md`/`docs/` cold each session, or when multiple agents/worktrees compound that cost. Until then it's optional; the 18 agents have Read/Grep/Glob.

## One-time setup (founder runs — modifies local env / registers MCP)
```
/setup-gbrain          # PGLite local backend (free, ~30s); registers the gbrain MCP
/sync-gbrain --full    # index the cadence repo
```
`sync-gbrain` also writes a `## GBrain Search Guidance` section into CLAUDE.md so new sessions prefer semantic search over grep for "where does X live?" questions.

## Steady state (automated)
The `/cadence-deliver` **CLOSE** phase calls `/sync-gbrain` (incremental, ~50ms) so the index never drifts after a ship. No manual step once set up.
