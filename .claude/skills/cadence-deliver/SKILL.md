---
name: cadence-deliver
description: Entry point for the Cadence delivery pipeline. Use to take a CAD-N ticket (or a brief) through PLAN → BUILD → REVIEW → VERIFY via the committed multi-agent workflow, with the cast scaled to work-type and subsystem. Run plan-first, gate, then proceed. The single command to run the agent team.
---

# /cadence-deliver — run the delivery pipeline

The orchestration entry point for the Cadence agent team (see `docs/AGENT_TEAM.md`). Classifies the work, ensures a Linear ticket, and runs the committed workflow at the right fan-out.

## Steps
1. **Classify + tag.** Determine the **work-type** (`fix` | `feature` | `epic` | `incident` | `design` | `strategy` | `research-spike`) and the **subsystem tag(s)** from `docs/AGENT_TEAM.md` §1. The tags decide which Layer-II specialists join the cast.
2. **Ensure the ticket.** If there's no `CAD-N`, ask `cadence-bookkeeper` to create one (acceptance criteria required) before proceeding.
3. **Grill if ambiguous.** Run `/grill-me` to lock any genuine forks before spending build tokens.
4. **PLAN first (default).** Launch the workflow in plan phase:
   ```
   Workflow({ scriptPath: ".claude/workflows/cadence-deliver.js",
              args: { ticket: "CAD-N", brief: "<one-paragraph>",
                      workType: "feature", subsystems: ["llm-composer","eval-quality"],
                      phase: "plan" } })
   ```
   This runs the Architect (+ research spikes for tagged subsystems) and produces `docs/plans/CAD-N.md`. **Gate G-plan: Faeez approves the plan before any code.**
5. **PROCEED after approval.** Re-launch with `phase: "build"` — runs BUILD (Builder + owning specialists, Designer ∥ for UI) → REVIEW (Reviewer + eval-quality, +security if sensitive, adversarial) → VERIFY (QA + eval-quality). The workflow stops before SHIP.
6. **SHIP + CLOSE (human-gated).** You decide ship; run `/ship` or `/land-and-deploy`, then `cadence-bookkeeper` closes out.

## Cast scaling (cost dial)
- `fix` → builder + 1 reviewer (no designer/specialist unless tagged).
- `feature` → + owning specialist + designer (if UI) + eval-quality.
- `epic` → full relevant bench + security + 3-way adversarial review.

## Notes
- Use the `@agent` escape hatch (e.g. `@cadence-llm-composer ...`) for a focused single-agent consult without the full pipeline.
- This project runs "always-orchestrated" by standing decision — default to the workflow, but never spawn the whole bench for a tiny change (tag it `fix`).
