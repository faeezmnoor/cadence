# CLAUDE.md — Cadence (Claude Code)

@AGENTS.md

The shared, tool-agnostic project context is in `AGENTS.md` (imported above — stack, commands, repo map, conventions, boundaries, locked guardrails, sources of truth). This file adds the **Claude-Code specifics**: skill routing, the agent team, and the doc/decision lifecycle agents must follow.

## Skill routing
When a request matches a skill, invoke it via the Skill tool. When in doubt, invoke it.
- Product ideas/brainstorming → `/office-hours` · Strategy/scope → `/plan-ceo-review` · Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review` · Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate` · QA/site behavior → `/qa` or `/qa-only` · Code review → `/review` · Visual polish → `/design-review`
- Ship/deploy/PR → `/ship` or `/land-and-deploy` · Save/resume context → `/context-save` / `/context-restore` · Backlog-ready spec → `/spec`
- Cadence pipeline → `/cadence-deliver` · subsystem eval → `/cadence-eval` · close-out sync → `/cadence-bookkeeping` · cold-pickup docs → `/cadence-handover`

## Agent team & delivery pipeline
Cadence is built by a 3-layer, 18-agent team. **Full playbook: `docs/AGENT_TEAM.md`** (read before non-trivial work).
- **Orchestrator** — `cadence-cofounder`: routes work (work-type × subsystem → cast/skill/gates) and runs accountability standups. Plans + tracks; never ships (human-only); routes tracker writes through the bookkeeper.
- **Layer I — delivery squad:** architect, builder, reviewer, qa, designer, bookkeeper, security, debugger.
- **Layer II — specialist bench (9):** one deep, research-equipped owner per subsystem, pulled in by subsystem tag.
- **Layer III — harnesses:** eval harness (`cadence-eval-quality` + `/cadence-eval`) + the product agent-runtime harness (`cadence-agent-harness`).

**Pipeline:** `INTAKE → PLAN → BUILD (+DESIGN) → REVIEW (+SECURITY) → VERIFY → SHIP → CLOSE`. Gates: G-plan / G-review / **G-eval** (no subsystem ships without a move-or-hold metric) / G-verify / G-cadence. **SHIP is human.**
**Run it:** `/cadence-deliver <CAD-N> "<brief>"` → `phase:plan` (gate G-plan) → `phase:build` → `phase:close`. Escape hatch: `@cadence-<role>` for a single consult.

## Doc & decision lifecycle (every agent obeys — automated; no per-step prompt needed)
- **Decisions** → `docs/decisions/` (ADR, immutable, status lifecycle). A plan that changes a decision adds a *new* ADR — never edit an accepted one.
- **Plans** → `docs/plans/CAD-N.md` from `_TEMPLATE.md`. Only promotable to BUILD when the **"Plan Review — ready for build"** gate is filled and Faeez approves (G-plan).
- **CLOSE is automated.** After SHIP, `/cadence-deliver phase:close` (backed by `cadence-bookkeeper` + `cadence-handover`) auto-runs, no prompting per step: archive the plan to `docs/plans/_archive/` with a SHIPPED header → regenerate `HANDOVER.md` + the `cadence-*` memory primers → sync Linear/Notion + the Notion decisions index + `CHANGELOG.md` → `/sync-gbrain` → run the **Ratchet** pass.
- **Ratchet rule (harness-hardening):** when an agent makes a mistake, fix the *harness* — `AGENTS.md`, this file, a skill, a hook, or an ADR — not just the code. The harness only tightens, never loosens.
