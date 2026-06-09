# Canonical owner: `/cadence/blueprint/`

**Do not edit files in this directory.**

Canonical product specs (PRD, architecture, data model, roadmap, MVP scope) live in
`/cadence/blueprint/` at the workspace root. This `cadence/app/docs/` directory is a
**read-only mirror** — it exists so the nested app repo carries a synced snapshot of
the specs alongside the code, but it is not the source of truth.

## Policy

- **Edit:** `~/.openclaw/workspace/cadence/blueprint/*.md`
- **Never edit:** `~/.openclaw/workspace/cadence/app/docs/*.md` (this directory)
- If you find divergence, blueprint wins. Re-sync this directory from blueprint.

## Why

Adopted from `cadence/strategy/workspace-knowledge-audit-v1.md` (2026-06-05). Two
copies of the same spec drift; the audit picked blueprint as canonical because it
sits at the planning layer (above the nested app repo) and is what cofounder /
planning agents read first.

See also: `cadence/CLAUDE.md` and memory `feedback_cadence_blueprint_canonical.md`.
