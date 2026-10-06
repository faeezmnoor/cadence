<!-- layer: knowledge · status: living · verified: 2026-10-06 · budget: 100 lines -->
# Documents — Cadence

Standard: house-standard 1.2.2 · Tier: standard · UI: yes · DB: yes · Lint: `bun .standard/standard-check.mjs .`

## Read first
1. AGENTS.md (and CLAUDE.md) · 2. STATE.md · 3. this file · 4. the current slice's docs/slices/<id>/brief.md

## Where each fact lives
| Fact | File |
| --- | --- |
| Current state, next, blocked | STATE.md |
| Owner's open items | docs/OWNER-QUEUE.md |
| Direction and order of work | docs/roadmap.md (Linear team CAD mirrors it) |
| Why the product exists, for whom, pricing, glossary | docs/product/brief.md |
| How it is built, the nine pipeline subsystems | docs/architecture/overview.md; docs/architecture/schema.md (generated) |
| Decisions and owner rulings | docs/decisions/ |
| Design tokens and visual rules | DESIGN.md |
| UI copy: voice, vocabulary, banned words, honesty rules | apps/web/COPY_GUIDE.md |
| Lessons | docs/lessons.md |
| How work runs here | docs/workflow.md |
| Operations (deploy, smoke, bot, migrations, credits, flags, Stripe) | docs/runbooks/ |
| Open work | docs/slices/ |
| Records, not reading | docs/records/ (index: docs/records/index.md), docs/_archive/ (index: docs/_archive/index.md) |

## Frozen and pinned
- docs/runbooks/*.md file names — pinned: code and a test cite them (apps/web/test/stripe-skus-runbook.test.ts reads stripe-skus-v2.md and checks its pack figures).
- apps/web/COPY_GUIDE.md — pinned in place: code comments cite its sections ("COPY_GUIDE §n"); it is the home for UI-copy rules.
- prompts/ — pinned: runtime input read by the chat route (apps/web/next.config.mjs `outputFileTracingIncludes`); not documentation.
- proposals/ — frozen design proposals cited by code comments and decision 0004; read only when a brief cites them.

## Other folders, classified
- cadence/blueprint/ — one sample brief kept from the old planning workspace; sample artifact, not reading.
- services/prices/README.md — package README of the yfinance sidecar; knowledge, owned by that package.
- apps/web/README.md — package README (directory map, provider abstraction, ops notes such as database backups); knowledge.
- apps/web/scripts/PRO-BAKEOFF.md — documentation of the Advanced bake-off script beside it; knowledge, pinned beside its script.
- docs/screenshots/ — images embedded by the public README.md; README assets, not documentation.

## Decisions (generated)
<!-- gen-decision-index -->
| No. | Title | Status | Date |
| --- | --- | --- | --- |
| 0000 | Record architecture & product decisions as ADRs | accepted | 2026-06-19 |
| 0011 | Maintain a pluggable web-search registry; Standard default is eval-decided | accepted | 2026-06-16 |
| 0005 | Standing-config noun stays "brief" ("watch" rename REVERSED) | accepted | 2026-06-16 |
| 0012 | Eval rubric is hybrid; gate threshold is MIN_LEAD = 0.5 | accepted | 2026-06-14 |
| 0010 | Research is three modes (Standard / Advanced / Custom); "Pro" is retired | accepted | 2026-06-14 |
| 0009 | Advanced tier paused behind PRO_TIER_ALPHA | accepted | 2026-06-14 |
| 0008 | Pricing: Standard 1 credit, Advanced 5 credits | accepted | 2026-06-14 |
| 0007 | Advanced research sells specificity + fit, not grounding | accepted | 2026-06-14 |
| 0006 | Research tiers reduced to two (Standard + Advanced) | accepted | 2026-06-13 |
| 0004 | Brief-creation flow: starter cards + "Browse all briefs" gallery | accepted | 2026-06-11 |
| 0003 | "Brief", not "digest", for the user-facing artifact | accepted | 2026-06-11 |
| 0002 | Monetization: pre-paid credits, no subscriptions | accepted | 2026-06-02 |
| 0001 | Positioning: lead with the value prop, never the channel | accepted | 2026-05-29 |

## Cast (generated)
<!-- gen-roster -->
| Agent | Model | Tier | Kind |
| --- | --- | --- | --- |
| cadence-agent-harness | opus | - | specialist |
| cadence-architect | opus | - | specialist |
| cadence-bookkeeper | haiku | - | specialist |
| cadence-builder | sonnet | - | specialist |
| cadence-channels-delivery | opus | - | specialist |
| cadence-cofounder | opus | - | specialist |
| cadence-content-format | opus | - | specialist |
| cadence-debugger | sonnet | - | specialist |
| cadence-designer | sonnet | - | specialist |
| cadence-eval-quality | opus | - | specialist |
| cadence-llm-composer | opus | - | specialist |
| cadence-multi-llm-provider | opus | - | specialist |
| cadence-qa | sonnet | - | specialist |
| cadence-research-search | opus | - | specialist |
| cadence-retrieval-consolidation | opus | - | specialist |
| cadence-reviewer | opus | - | specialist |
| cadence-security | opus | - | specialist |
| cadence-self-learning | opus | - | specialist |
