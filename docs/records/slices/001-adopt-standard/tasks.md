<!-- layer: knowledge · status: living (while open) · verified: 2026-10-06 · budget: 150 lines -->
# 001 · adopt-standard — tasks

Runbook order (STANDARD.md §13, line 228). Who: B builder, R reviewer, O orchestrator, K bookkeeper. "P" = may run in parallel with the named task (no shared files); one writer per branch still applies, so parallel means order-free, not concurrent writers. Commit after each task that changes files; never `git add -A` (stage named paths).

| Id | Who | Task | Paths | Serves | Parallel | Done |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | B | Freeze check: `gh pr list --state open` is empty; `git fetch origin`; note origin/main head (352b2e4 on 2026-10-06) in notes.md | notes.md | step 1 | — | [ ] |
| T002 | B | Preconditions: read $STANDARD_DIR/VERSION; check `$STANDARD_DIR/scripts/gen-schema.ts` exists on the standard repo's main; confirm Linear CAD is readable or an export was supplied; copy the orchestrator's rulings on OQ-1 to OQ-6 into notes.md. Missing ruling on OQ-3 or OQ-4 → stop | notes.md | all | — | [ ] |
| T003 | B | Inventory: compare plan.md's disposition table with `git ls-files` for `*.md`, `.claude/`, `.github/`; any path not in the table → a row in notes.md and a line in the report | notes.md | AC-10 | — | [ ] |
| T004 | B | Snapshot before rewriting: `git mv` AGENTS.md, CLAUDE.md, docs/roadmap.md to docs/_archive/2026-10/ (same relative paths); index rows | docs/_archive/ | AC-10 | — | [ ] |
| T005 | B | docs/lessons.md from template: one L-NN per costly rule in plan.md "Rule rehome" (date, what happened, cost, rule, where it lives); sources cited by path and line | docs/lessons.md | AC-16 | — | [ ] |
| T006 | B | AGENTS.md from template: header line plus eight sections; §2 commands from package.json (pnpm 11.2.2, Node ≥ 20; verification `pnpm typecheck && pnpm lint && pnpm test`); §6 one-liners each ending (lesson L-NN) or (decision 00NN); ≤ 150 lines | AGENTS.md | AC-13, AC-16 | — | [ ] |
| T007 | B | .claude/rules/web-app.md with `paths: ["apps/web/**"]` from apps/web/CLAUDE.md 51–153 and 203–223, ARCHITECTURE.md 414–430, HANDOVER.md §8 dev how-tos (re-verified file paths) | .claude/rules/web-app.md | AC-16 | with T008 | [ ] |
| T008 | B | Eight scoped rule files `.claude/rules/<subsystem>.md`, `paths:` on each code area (AGENT_TEAM.md 26–36), holding only the agent's Cadence-specific working rules | .claude/rules/ | AC-16 | with T007 | [ ] |
| T009 | B | Nothing-lost ledger: every source range in spec.md "Nothing-lost checks" → destination or "retired: reason" | notes.md | AC-16 | — | [ ] |
| T010 | B | CLAUDE.md: line 1 `@AGENTS.md`, then ≤ 19 Claude-only lines (skill routing incl. cadence-eval and the plugin's deliver skill) | CLAUDE.md | AC-13 | with T011 | [ ] |
| T011 | B | docs/README.md: declaration `Standard: house-standard <VERSION> · Tier: standard · UI: yes · DB: yes`; the map (COPY_GUIDE as UI-copy home); frozen and pinned (runbook names cited by code, prompts/, proposals/, COPY_GUIDE); classification of cadence/blueprint/, prompts/, proposals/, services/prices/, docs/screenshots/, apps/web/scripts/PRO-BAKEOFF.md; generated-block markers; ≤ 100 lines | docs/README.md | AC-1, AC-14 | with T010 | [ ] |
| T012 | B | docs/product/brief.md: sections and budgets per STANDARD.md §8 line 128; pack table from apps/web/server/billing/packs.ts lines 37–46 with display names from 0010; credit costs from 0008; glossary ≤ 30 lines | docs/product/brief.md | AC-1, AC-16 | with T013–T015 | [ ] |
| T013 | B | docs/architecture/overview.md per plan.md cut; four Mermaid flows F-01–F-04; subsystem table; debts; ≤ 300 lines; every Mermaid block parses (`npx -y @mermaid-js/mermaid-cli` or the lint when it checks) | docs/architecture/overview.md | AC-1 | with T012 | [ ] |
| T014 | B | DESIGN.md phase one; token-to-source table in notes.md | DESIGN.md, notes.md | AC-1 | with T012 | [ ] |
| T015 | B | docs/workflow.md per plan.md declaration | docs/workflow.md | AC-1 | with T012 | [ ] |
| T016 | B | docs/OWNER-QUEUE.md: rows from plan.md, each verified against Linear or a command output (CI log, `gh repo view`); each with one link (Linear issue or runbook); no names | docs/OWNER-QUEUE.md | S2 | — | [ ] |
| T017 | B | docs/roadmap.md from Linear CAD open issues (Now, Next, Later; CAD-238 cites docs/records/plans/eval-harness-upgrade.md) | docs/roadmap.md | AC-15 | with T018 | [ ] |
| T018 | B | docs/inbox.md (empty list), docs/records/index.md, docs/_archive/index.md headers; CHANGELOG.md records header; the existing Unreleased block dated 2026-06-19 | listed | AC-1 | with T017 | [ ] |
| T019 | B | Decisions 0000–0012 to MADR in place, body verbatim, statuses and decision-makers per plan.md; 0012 plan link → docs/records/plans/ | docs/decisions/ | AC-11 | with T020 | [ ] |
| T020 | B | Runbooks: header + six sections wrapping existing text, steps untouched; DEPLOY.md gains Rollback; new apply-migration.md, grant-credits.md, advanced-flag.md, stuck-user.md with commands verified in code; run G13 | docs/runbooks/ | AC-12 | with T019 | [ ] |
| T021 | B | `git mv` to records: PLATFORM-AUDIT-2026-06-11.md → docs/records/audits/; docs/plans/eval-harness-upgrade.md → docs/records/plans/; apps/web/COPY_FIXES_PROPOSED.md → docs/records/copy/; index rows | docs/records/ | AC-10 | — | [ ] |
| T022 | B | `git mv` to docs/_archive/2026-10/: HANDOVER.md, docs/AGENT_TEAM.md, docs/plans/_TEMPLATE.md, docs/plans/_archive/README.md, apps/web/server/ARCHITECTURE.md, apps/web/CLAUDE.md; index rows; then the OQ-3 redaction pass on every archived copy, noted in each row's reason | docs/_archive/ | AC-4–AC-6, AC-10 | — | [ ] |
| T023 | B | Path-only link updates: README.md line 88; apps/web/README.md lines 13, 102, 360–362; comments in apps/web/server/db/schema.ts line 10, apps/web/lib/research-stack.ts line 101, apps/web/scripts/seed-smoke-spec.mjs line 25. Report, do not change, runtime strings (apps/web/components/telegram/link-telegram-client.tsx line 437) | listed | AC-9 | — | [ ] |
| T040 | B | Generators: copy $STANDARD_DIR/dist/standard-check.mjs to .standard/standard-check.mjs; `bun run $STANDARD_DIR/scripts/gen-schema.ts .` → docs/architecture/schema.md (absent → STOP); gen-decision-index and gen-roster if present | .standard/, docs/architecture/schema.md, docs/README.md | AC-7 | — | [ ] |
| T041 | B | Run the lint; fix findings in documents only; record the RLS-policies finding if the generated file reports none | docs | AC-1, AC-14 | — | [ ] |
| T050 | B | `git mv` 16 agent files, 5 skills and .claude/workflows/cadence-deliver.js to docs/_archive/2026-10/.claude/…; index rows "retired, replaced by shared role X / skill Y"; redaction pass | .claude/, docs/_archive/ | AC-8, AC-10 | — | [ ] |
| T051 | B | Rewrite the two specialists and skills/cadence-eval/SKILL.md to live paths, "the owner" for the name; specialists ≤ 80 lines | .claude/agents/, .claude/skills/cadence-eval/ | AC-8, AC-9 | — | [ ] |
| T052 | B | .claude/settings.json reduced to permissions (plus any project hook, none today); .gitignore adds `!.claude/settings.json` and `!.claude/rules/`; stage both | .claude/settings.json, .gitignore | AC-9 | — | [ ] |
| T053 | B | ci.yml: job `standard-check` with `name: standard-check`, oven-sh/setup-bun, `bun .standard/standard-check.mjs .`; db-backup.yml untouched | .github/workflows/ci.yml | AC-17 | — | [ ] |
| T060 | B | STATE.md from live code, CI and Linear (never HANDOVER); Owner items "see docs/OWNER-QUEUE.md"; Measurements left for O (L-13); verified line written last, naming the head before this commit (L-10) | STATE.md | AC-15 | — | [ ] |
| T061 | B | Run gate-check on gates.md (G1–G16); report. Stop here: the builder never pushes | gates.md | all | — | [ ] |
| T062 | O | Rebase onto origin/main immediately before the PR (L-16); carry upstream changes to moved files; re-run G15; push; open the PR | — | step 9 | — | [ ] |
| T063 | R | Two reviewers who did not build: correctness (ledger, ten sampled rules, decision and runbook diffs, dead paths, planted lint defect) and security and privacy; verdict lines in notes.md (G17) | notes.md | AC-16 | R lanes in parallel | [ ] |
| T064 | O | Read job display names from the first run; protect main with `check` and `standard-check` once OQ-1 is settled (L-15) | — | AC-17 | — | [ ] |
| T065 | O | Cold-start test via the cold-start skill; result into STATE.md §Measurements | STATE.md | AC-18 | — | [ ] |
| T066 | K | Linear: issue for this slice; one issue per owner-queue row assigned to the owner; repo wins | — | AC-19 | — | [ ] |
| T067 | K | CLOSE: CHANGELOG entry; inbox empty; after merge move the slice folder to docs/records/slices/ | CHANGELOG.md, docs/records/slices/ | step 12 | — | [ ] |
| T068 | O | LEARN in $STANDARD_DIR: each finding → lesson, template, script fix or decision; bump VERSION | standard repo | step 13 | — | [ ] |
