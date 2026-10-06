@AGENTS.md

<!-- layer: knowledge · status: living · verified: 2026-10-06 · Claude Code specifics only; at most 20 lines. Behaviour rules: .claude/rules/ (path-scoped). Procedures: skills. -->
## Skill routing
- Run a slice end to end (plan, build, review, close): the shared `deliver` skill; close-out sync: `bookkeeping`; resume cold: `cold-start`.
- Pipeline subsystem change (sources, ranking, composer, providers, channels, formats, self-learning, runtime): `/cadence-eval` for the move-or-hold number (G-eval).
- Bugs and incidents: `/investigate` · Security-sensitive diffs (auth, credits, secrets, row-level security, webhook, admin): the `cadence-security` agent.
- Eval design, golden sets, judge calibration: the `cadence-eval-quality` agent.
- Browser checks of a preview deployment: `/browse` or `/qa`.

## Notes
- Shared roles (planner, builder, reviewer, challenger, qa, designer, debugger, bookkeeper, search) come from the house-standard plugin; this repo keeps only the two specialists in .claude/agents/.
- `.claude/rules/web-app.md` and the eight subsystem rule files load only when a matching file under apps/web/ is read.
