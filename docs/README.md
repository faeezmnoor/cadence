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

## Cast (generated)
<!-- gen-roster -->
