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

## Delivery pipeline & agent team

Cadence is built by a 3-layer agent team. **Full playbook: `docs/AGENT_TEAM.md`** (read it before non-trivial work).

- **Layer I — delivery squad** (`.claude/agents/cadence-{architect,builder,reviewer,qa,designer,bookkeeper,security,debugger}.md`): owns the lifecycle.
- **Layer II — specialist bench** (`.claude/agents/cadence-{research-search,retrieval-consolidation,llm-composer,multi-llm-provider,channels-delivery,content-format,self-learning,eval-quality,agent-harness}.md`): one deep, research-equipped owner per subsystem; pulled onto a ticket by subsystem tag.
- **Layer III — harnesses**: the **eval harness** (`cadence-eval-quality` + `/cadence-eval`) and the product **agent runtime harness** (`cadence-agent-harness`).

**Pipeline:** `INTAKE → PLAN → BUILD (+DESIGN) → REVIEW (+SECURITY) → VERIFY → SHIP → CLOSE`, gates G-plan / G-review / **G-eval** / G-verify / G-cadence. The main session is the Orchestrator/PM and never delegates ship.

**Run it:** `/cadence-deliver <CAD-N> "<brief>"` (plan-first, then `phase:build` after you approve) → committed workflow `.claude/workflows/cadence-deliver.js`. Escape hatch: `@cadence-<role> ...` for a single-agent consult.

**Rule: no subsystem change ships without a move-or-hold eval metric (G-eval).** Specialists are evidence-first — `/deep-research` before recommending on the 9 subsystems.

Ported Cadence skills (Claude-Code-native): `cadence-build-wave`, `cadence-fix-pass`, `cadence-handover`, `cadence-bookkeeping`.
