# CLAUDE.md — Cadence app (nested repo)

This is the git repo for the Cadence web app — shippable code plus its own
docs. Product direction (strategy, PRDs, decisions) lives in **Notion**
("📡 Startup - Cadence") and **Linear** (team `CAD-`); this repo is canonical
for code, architecture, and the operational runbooks under `docs/`.

## Hard rules

1. **Cadence ≠ LiveWheel.** Different repo, ICP, Linear team (CAD vs LWL), and
   Notion tree. Never mix the two.
2. App code, tests, migrations, `pnpm`, `git` — all run from the repo root (or `apps/web`).
3. Deeper context: `apps/web/CLAUDE.md`, `apps/web/server/ARCHITECTURE.md`, `HANDOVER.md`, `README.md`.

## Pointers

- Product direction / strategy / PRDs / Decisions Log: **Notion** "📡 Startup - Cadence"
- Tickets (source of truth for work): **Linear**, team `CAD-`
- Live system state: `HANDOVER.md` · Architecture: `apps/web/server/ARCHITECTURE.md`
- Agent team & delivery pipeline: `docs/AGENT_TEAM.md`

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

- **Orchestrator** — `cadence-cofounder` (`.claude/agents/cadence-cofounder.md`): the delivery-orchestration & accountability brain backing the main session. Invoke it (or `@cadence-cofounder`) to route a request to the right work-type/subsystem/cast/skill/gates, or to run a standup that audits Linear/Notion/git and holds every agent + gate accountable. It plans + tracks; it never ships (human-only) and routes tracker writes through the bookkeeper.
- **Layer I — delivery squad** (`.claude/agents/cadence-{architect,builder,reviewer,qa,designer,bookkeeper,security,debugger}.md`): owns the lifecycle.
- **Layer II — specialist bench** (`.claude/agents/cadence-{research-search,retrieval-consolidation,llm-composer,multi-llm-provider,channels-delivery,content-format,self-learning,eval-quality,agent-harness}.md`): one deep, research-equipped owner per subsystem; pulled onto a ticket by subsystem tag.
- **Layer III — harnesses**: the **eval harness** (`cadence-eval-quality` + `/cadence-eval`) and the product **agent runtime harness** (`cadence-agent-harness`).

**Pipeline:** `INTAKE → PLAN → BUILD (+DESIGN) → REVIEW (+SECURITY) → VERIFY → SHIP → CLOSE`, gates G-plan / G-review / **G-eval** / G-verify / G-cadence. The main session is the Orchestrator/PM and never delegates ship.

**Run it:** `/cadence-deliver <CAD-N> "<brief>"` (plan-first, then `phase:build` after you approve) → committed workflow `.claude/workflows/cadence-deliver.js`. Escape hatch: `@cadence-<role> ...` for a single-agent consult.

**Rule: no subsystem change ships without a move-or-hold eval metric (G-eval).** Specialists are evidence-first — `/deep-research` before recommending on the 9 subsystems.

Ported Cadence skills (Claude-Code-native): `cadence-build-wave`, `cadence-fix-pass`, `cadence-handover`, `cadence-bookkeeping`.
