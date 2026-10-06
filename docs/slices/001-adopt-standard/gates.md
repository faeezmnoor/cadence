<!-- layer: records · status: living (while open) · verified: 2026-10-06 -->
# 001 · adopt-standard — gate ledger
From $STANDARD_DIR/templates/docs/slices/_migration/gates.md, filled for Cadence. Written before any move. Only the gate-check script writes EVIDENCE; `\|` in a cell is a literal pipe. Run from the repo root with `STANDARD_DIR` set. The hygiene greps (G4–G6) cover more paths than the template because the repository is public (verified 2026-10-06) and agent files are committed documents. G5 brackets one letter so the gate does not match itself (L-09).

| Gate | CHECK | EXPECT | EVIDENCE |
| --- | --- | --- | --- |
| G1 | `bun .standard/standard-check.mjs .` | exit 0 | |
| G2 | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 | |
| G3 | `pnpm build` | exit 0 | |
| G4 | `sh -c 'test -z "$(grep -rIls -e /Us[e]rs/ -e /ho[m]e/ AGENTS.md CLAUDE.md STATE.md DESIGN.md README.md CHANGELOG.md docs .claude .github)"'` | exit 0 | |
| G5 | `sh -c 'test -z "$(grep -rIls -i fa[e]ez AGENTS.md CLAUDE.md STATE.md DESIGN.md README.md CHANGELOG.md docs .claude .github)"'` | exit 0 | |
| G6 | `sh -c 'test -z "$(grep -rIlsE "[0-9a-f]{64}" AGENTS.md CLAUDE.md STATE.md DESIGN.md README.md CHANGELOG.md docs .claude .github)"'` | exit 0 | |
| G7 | `sh -c "head -5 docs/architecture/schema.md \| grep -q 'generated: '"` | exit 0 | |
| G8 | `sh -c "bun run \"$STANDARD_DIR/scripts/gen-schema.ts\" . --check"` | exit 0 | |
| G9 | `sh -c 'for r in planner builder reviewer challenger qa designer debugger bookkeeper search; do f=.claude/agents/$r.md; test -e $f \|\| continue; test $(wc -l < $f) -le 40 \|\| exit 1; done; for f in .claude/agents/*.md; do case $f in */cadence-eval-quality.md\|*/cadence-security.md) ;; *) exit 1;; esac; done'` | exit 0 | |
| G10 | `sh -c 'test -z "$(grep -rIlsE "HANDOVER\.md\|AGENT_TEAM\|docs/plans/\|server/ARCHITECTURE\.md\|cadence-(deliver\|bookkeeping\|handover\|build-wave\|fix-pass\|architect\|builder\|reviewer\|bookkeeper\|debugger\|designer\|qa\|cofounder)" AGENTS.md CLAUDE.md docs/workflow.md .claude/agents .claude/skills .claude/rules .claude/settings.json)"'` | exit 0 | |
| G11 | `sh -c 'for f in HANDOVER.md PLATFORM-AUDIT-2026-06-11.md docs/AGENT_TEAM.md docs/plans apps/web/CLAUDE.md apps/web/server/ARCHITECTURE.md apps/web/COPY_FIXES_PROPOSED.md .claude/workflows; do test ! -e $f \|\| exit 1; done; for f in HANDOVER.md docs/AGENT_TEAM.md apps/web/CLAUDE.md apps/web/server/ARCHITECTURE.md _claude/agents/cadence-builder.md _claude/skills/cadence-deliver/SKILL.md; do test -e docs/_archive/2026-10/$f && grep -qF docs/_archive/2026-10/$f docs/_archive/index.md \|\| exit 1; done'` | exit 0 | |
| G12 | `sh -c 'set -- docs/decisions/00*.md; test $# -ge 13 \|\| exit 1; for f in "$@"; do test "$(sed -n 1p $f)" = "---" && grep -qE "^status: (proposed\|accepted\|rejected\|deprecated\|superseded)$" $f \|\| exit 1; done'` | exit 0 | |
| G13 | `sh -c "cd apps/web && npx vitest run test/stripe-skus-runbook.test.ts"` | exit 0 | |
| G14 | `sh -c 'test "$(sed -n 1p CLAUDE.md)" = "@AGENTS.md" && test $(grep -c "^## [1-8]\. " AGENTS.md) -eq 8'` | exit 0 | |
| G15 | `sh -c 'h=$(git rev-parse --short=7 HEAD~1); grep -q "^verified: .* at $h" STATE.md'` | exit 0 | |
| G16 | `sh -c "grep -q 'name: standard-check' .github/workflows/ci.yml && git diff --quiet origin/main -- .github/workflows/db-backup.yml"` | exit 0 | |
| G17 | `sh -c 'test $(grep -cE "^- (correctness\|security and privacy): " docs/slices/001-adopt-standard/notes.md) -ge 2'` | exit 0 | |

Notes:
- G2 and G13 read the exit code, never the last line of piped output (L-17). G2 fails on main today (a stale migration path in one test, verified by a local run); it stays in the ledger unchanged and OQ-1 in brief.md decides how it turns green.
- G3: if `pnpm build` fails only for missing environment values, stop and report (OQ-6).
- G4–G6 and G10 use `test -z "$(grep …)"` so a missing path cannot make them pass by a grep error (a `! grep` form exits 0 on exit status 2). G4–G6 scan docs/_archive/ as well, because the lint's H1 walks the archive (verified: $STANDARD_DIR/scripts/lib/hygiene.ts lines 7–12) and the repo is public. They pass only with OQ-3's redaction of archived copies.
- G8 needs slice 005's generator on the standard repo's main; if absent, the builder stops at T040.
- G15 is the head before the final STATE.md commit (L-10). After any rebase, rewrite the verified line and re-run G15.
- G11 uses `_claude/` for the archived `.claude` content (ruling OQ-7); changed by the builder at T050 as the ledger note required.
- G17 is the last gate: the correctness and security-and-privacy reviewers each leave one verdict line in notes.md.
- Verify each command once by hand before trusting the script; a gate that cannot fail watches nothing.
