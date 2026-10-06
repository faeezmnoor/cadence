<!-- layer: records · status: record · verified: 2026-10-06 -->
# Review — 001 adopt-standard, correctness lane

Range: `main...slice/001-adopt-standard` at 2ee14ca (32 commits). Reviewer did not build the slice. Sources: the slice's spec.md, plan.md, notes.md and gates.md; originals read with `git show main:<path>`.

## Cold start (AGENTS.md and STATE.md only)
- Live: production on Vercel from main 001508c: chat configuration, Telegram linking and delivery, feedback and weekly distillation, the credit ledger. Not live: card checkout; Advanced paused behind its flag.
- Next: this slice's review lanes, pull request and branch protection, then triage of CAD-222, CAD-215, CAD-216, CAD-210, then CAD-70 to CAD-72.
- Waits on the owner: the `DATABASE_URL` Actions secret (backup), webhook-secret rotation, Stripe KYC, Advanced ratings. The full ordered list needs docs/OWNER-QUEUE.md; STATE.md's "Owner items" only points there, while "Blocked" names four of the nine rows.
- Sufficiency: enough for "live" and "next". "Owner" is partial without docs/OWNER-QUEUE.md, which the slice's own cold-start test does not include in the read set.

## 1. Nothing-lost checklist (plan.md disposition tables)
Moves were checked with `git diff main:<old> HEAD:<new>`. Each diff holds only the header line, the redactions ruled under OQ-3 (home paths, the owner's name, e-mail, secret, bot handle, project and team ids) and path-only link fixes.

### Documents
| Row | Result |
| --- | --- |
| AGENTS.md → rewritten; old copy archived | ✓ archived as `docs/_archive/2026-10/AGENTS.pre-standard.md` (header line only; rename explained in the index). Rules rehomed, with one exception: see finding F1 |
| CLAUDE.md → `@AGENTS.md` and Claude-only lines; old copy archived | ✓ 13 lines; archive diff is the header only |
| README.md → kept; path-only fix | ✓ |
| CHANGELOG.md → records header and dated entry | ✓ |
| HANDOVER.md → split, then archived | ✓ archive diff: header plus redactions only. Split checked section by section: §1 "three things" → L-15 and the brief's "Bets in force"; positioning rules → decision 0001 and the brief's audiences and non-goals; §3 → brief; §4 → overview; §6 and §9 → brief, corrected to decisions 0008 and 0010; §8 → four new runbooks and DEPLOY "Rollback"; §10 → overview "Configuration and secrets"; §11 → roadmap and owner queue; §12 → L-01, L-09, L-10, L-12, L-13, L-14, L-15, owner queue OQ-08 and OQ-09, and recorded retirements. Two runbook details drifted: see F3 |
| PLATFORM-AUDIT-2026-06-11.md → records | ✓ header plus one name redaction |
| docs/AGENT_TEAM.md → split, then archived | ✓ archive diff clean; §1 → overview "Subsystems"; §3 and §4 → docs/workflow.md; §7 → AGENTS.md §6 and the brief, except "Cadence is a sacred brand noun" (F1); §11 → recorded in the ledger |
| docs/roadmap.md → redrawn from the Linear export; old copy archived | ✓ ids match linear-export.md |
| decisions 0000–0012 → MADR in place | ✓ see §2 |
| docs/plans/_TEMPLATE.md, docs/plans/_archive/README.md → archive | ✓ |
| docs/plans/eval-harness-upgrade.md → records | ✓ header plus name redactions; decision 0012's link fixed |
| runbooks DEPLOY, SMOKE, TELEGRAM_BOT_SETUP, gbrain, stripe-skus-v2 → wrapped in place | ✓ every original line is still present, apart from titles and redactions (line-by-line check); G13 passes. The Stripe runbook's stale wording is F2 |
| docs/screenshots → kept and classified | ✓ |
| apps/web/server/ARCHITECTURE.md → overview, then archived | ✓ archive diff is the header only; dependency rules → .claude/rules/web-app.md; the chat-thread tripwire → web-app.md and the overview's debts |
| apps/web/CLAUDE.md → web-app.md, AGENTS.md §6, lessons; archived | ✓ "Things not to do" 1–10 each traced (L-12, L-09, retired, retired, L-04 to L-08, L-02); conventions and tests → web-app.md; archive diff: header plus three relative-link fixes |
| apps/web/COPY_GUIDE.md → kept, pinned | ✓ |
| apps/web/COPY_FIXES_PROPOSED.md → records | ✓ header plus one link fix |
| apps/web/README.md → path-only fixes | ✓ |
| PRO-BAKEOFF.md, services/prices/README.md, cadence/blueprint/, prompts/, proposals/, scripts/linear-status.sh → kept and classified | ✓ classified in docs/README.md or AGENTS.md §8 |

### Agents, skills, workflow, settings
| Row | Result |
| --- | --- |
| cadence-eval-quality, cadence-security → kept and trimmed | ✓ 30 and 35 lines; the security hot spots are all kept and extended |
| Eight subsystem agents → overview rows plus `.claude/rules/<subsystem>.md`; archived | ✓ eight rule files with `paths:`; archive diffs are the header only; spot-checked research-search: every working rule is present |
| architect, builder, reviewer, bookkeeper, debugger, designer, qa, cofounder → archived | ✓ eight archived copies, each with an index row naming the shared role |
| skills: cadence-eval kept; five others archived | ✓ five archived copies with index rows |
| .claude/workflows/cadence-deliver.js → archived | ✓ archived and indexed; the folder is gone |
| settings.json → permissions only, committed | ✓ valid JSON with no hooks |
| launch.json → untouched | ✓ still ignored |

Result: 27 rows ticked, 1 finding (F1). Content is lost from the live set in one place only.

## 2. Decision records
- ✓ All 13 keep their numbers and file names. The frontmatter (status, date, decision-makers) is valid. Every one says `decision-makers: the owner (ruled by owner)`.
- ✓ Every original body line is present word for word. The only exception is the link in 0012, which changed path only. Each record keeps its original status and date text as a body line. Examples: 0005 "reversed"; 0009 "gate threshold superseded by ADR 0012".
- ✓ Pricing: the brief, AGENTS.md §6, the glossary and the pack table follow 0008 (Standard 1 credit, Advanced 5) and 0010 (Taste, Everyday, Power, Max; "Pro" retired). The pack table matches packs.ts. No live document outside the Stripe runbook repeats the handover's 3-credit "Pro tier" (F2).
- Note: "Considered options" in 0001 lists an option B that the original text implies but does not name.

## 3. Canonical files
- ✓ AGENTS.md has 81 lines, the header line and eight numbered sections in order. Its header starts `standard: 1.2.2 · tier: standard · ui: yes · db: yes`, followed by `· verified:`.
- ✓ The §2 commands work: `pnpm typecheck && pnpm lint && pnpm test` exits 0 (130 files, 1224 tests passed).
- ✓ Each of the 23 rules in §6 ends with a lesson or decision. There are no Claude-only terms; the only mention is §8's factual repo-map line for `.claude/`.
- ✓ CLAUDE.md starts with `@AGENTS.md` and has 13 lines.
- ✓ STATE.md has 36 lines. Its verified line names 146c495, the commit before the STATE commit, as G15 defines. Now and Next come from the Linear export. The owner items point to docs/OWNER-QUEUE.md, which holds the three items the brief requires plus six more.
- ✓ The map in docs/README.md is complete, and both generated blocks are present.
- ✓ The declaration in docs/workflow.md is complete: tier, cast, specialists, overrides, verification, runtime checks, viewports, gates, references, Linear and Notion.
- ✓ overview.md has 194 lines with the context and container diagrams. The nine subsystems are one table of nine rows, not nine sections, which matches the plan.
- ✓ schema.md carries the `generated:` header, and G8 regenerates it identically.
- ✓ The DESIGN.md frontmatter parses as YAML. Three values match the code: `background` hsl(0 0% 100%) and `brand` hsl(14 72% 45%) match globals.css; `rounded.md` calc(0.5rem − 2px) matches tailwind.config.ts.
- Minor: the overview's Containers table lists "shadcn/ui", but DESIGN.md says correctly that no `components/ui` library is installed (only components.json exists).

## 4. Agents, skills, lint and gates
- ✓ .claude/agents holds only the two specialists, .claude/skills holds only cadence-eval, all nine rule files carry `paths:`, and .claude/workflows is gone.
- ✓ `bun .standard/standard-check.mjs .` reports 0 FAIL and 1 WARN (the missing LICENSE, an owner decision).
- ✓ Gates run as written in gates.md: G2, G4, G5, G6, G7, G8, G9, G10, G11, G12, G13, G14, G15 and G16 each exit 0.
- G15 caveat: it compares against `HEAD~1`, so this review commit (and any later one) makes it fail. The orchestrator must rewrite the verified line after the reviews (L-10).

## 5. Links and moved-document citations
- ✓ All 17 relative Markdown links in the root files and docs/**/*.md resolve. Beyond those, 193 distinct repo paths cited in the key documents were checked. None is dead except: original paths in the two indexes (expected); lessons citing archived sources by original line (expected); `docs/records/slices/` (not created yet); and `apps/web/.env.example` in README.md:97 and DEPLOY.md, which predates this slice. That file is at the repository root.
- Follow-up slice: code citations of moved documents (old → new):
  - apps/web/app/api/chat/route.ts:501 "CLAUDE.md rule 6" → docs/lessons.md L-05 (AGENTS.md §6)
  - apps/web/test/reply-capture.test.ts:20 "per CLAUDE.md" → .claude/rules/web-app.md "Tests"
  - apps/web/test/duckduckgo-parse.test.ts:6 "apps/web/CLAUDE.md" → .claude/rules/web-app.md "Tests"; L-11
  - apps/web/test/manage-mode-migration-0029.test.ts:5 "CLAUDE.md Testing philosophy" → .claude/rules/web-app.md "Tests"
  - apps/web/test/billing-request-credits.test.ts:5 "per CLAUDE.md" → L-11; .claude/rules/web-app.md "Tests"
  - apps/web/test/pro-search-execution.test.ts:18 "CLAUDE.md Testing philosophy" → .claude/rules/web-app.md "Tests"
  - Runtime string: apps/web/components/telegram/link-telegram-client.tsx:437 "docs/TELEGRAM_BOT_SETUP.md" → docs/runbooks/TELEGRAM_BOT_SETUP.md
  - Frozen, leave as is: migration 0029's SQL comment "ARCHITECTURE.md" → docs/_archive/2026-10/apps/web/server/ARCHITECTURE.md

## Findings
- F1 (content lost; blocking): the rule "'Cadence' is a sacred brand noun" (original AGENTS.md line 29, guardrail 1; AGENT_TEAM.md §7 guardrail 1) has no live home and no retirement row in the ledger. It is not in AGENTS.md §6, decisions 0003 or 0005, the brief, COPY_GUIDE, lessons or any rule file. The ledger row for "Locked guardrails 1–6" claims full coverage. Fix: add one line, for example to the brief's Constraints or AGENTS.md §6 ("Cadence" is the brand noun; never genericise or rename it, decision 0003), or record a retirement with a reason.
- F2 (stale, not blocking): docs/runbooks/stripe-skus-v2.md still says "Pro pack" (lines 37, 52, 54) and describes Advanced as a "3× credit-cost multiplier" (line 54). That contradicts decisions 0008 (5 credits) and 0010 (pack display name "Max"; "Pro" never user-facing). The slice kept the steps verbatim by rule, and a test pins the pack figures. Fix: add a dated note at the top of the runbook stating that 0008 and 0010 win, so nobody names a Stripe product "Pro pack".
- F3 (drift in new runbooks, not blocking): grant-credits.md says that after a Stripe refund "the webhook deducts". No Stripe webhook exists, and the handover's step said to issue a compensating admin grant. stuck-user.md step 4 dropped the handover's concrete fix location (`server/ai/providers/default.ts` model or system prompt) in favour of "open a slice". Both are small; the first is an invented mechanism.
- F4 (gate coverage): the lint has no check on decision frontmatter (planted defects below), and G15 breaks on any commit after STATE.

## Planted defects (restored from saved copies; tree clean afterwards, lint 0 FAIL)
| Plant | Lint | Gates |
| --- | --- | --- |
| Dropped the `telegram_chat_id` rule (HANDOVER pitfall, L-10) from AGENTS.md §6 | survived | survived (G14 counts sections, not rules) |
| Removed the cadence-qa row from docs/_archive/index.md | survived | survived (G11 checks six named rows) |
| Removed the HANDOVER.md row from docs/_archive/index.md | survived | caught by G11 |
| Removed the closing `---` from decision 0007's frontmatter | survived | survived (G12 checks line 1 and a status line) |
| `decision-makers: [unclosed` (invalid YAML) in 0007 | survived | survived |
| `status: approved` in 0007 | survived | caught by G12 |

## Not checked
- G3 (`pnpm build`), which waits for the Vercel preview of the pull request.
- G17 (verdict lines in notes.md), which belongs to the orchestrator.
- The security lane's scope: for example, the seed script still has the owner's e-mail as a built-in default, according to SMOKE.md line 27.
- Linear issues outside the export.

VERDICT: BLOCK — one rule (F1) lost its live home with no recorded retirement. Every gate passes; the fix is one line plus a ledger row.
