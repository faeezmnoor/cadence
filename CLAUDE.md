# CLAUDE.md — Cadence app (nested repo)

This is the **nested git repo** for the Cadence web app. The outer `cadence/`
workspace holds planning/strategy/blueprint files; this dir holds shippable code.

## Hard rules

1. **Cadence ≠ LiveWheel.** See outer `cadence/CLAUDE.md` and `feedback_keep_projects_separate.md`.
2. **Canonical specs live in `/cadence/blueprint/`** (outer workspace), NOT in
   `app/docs/`. The `app/docs/` directory is a read-only mirror snapshot.
   **Never edit `app/docs/*.md`** — edit `blueprint/` and re-sync. See
   `app/docs/CANONICAL_OWNER.md` and memory `feedback_cadence_blueprint_canonical.md`.
3. App code, tests, migrations, `pnpm`, `git` — all run from THIS dir.
4. App-specific deeper context: `apps/web/CLAUDE.md`, `HANDOVER.md`, `README.md`.

## Pointers

- Outer planning workspace: `~/.openclaw/workspace/cadence/`
- Outer entrypoint: `~/.openclaw/workspace/cadence/CLAUDE.md`
- Outer handover: `~/.openclaw/workspace/cadence/HANDOVER.md`
- Canonical specs: `~/.openclaw/workspace/cadence/blueprint/`
- Strategy docs: `~/.openclaw/workspace/cadence/strategy/`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
