---
paths:
  - "apps/web/server/sources/index.ts"
  - "apps/web/server/sources/authority.ts"
---
# Consolidation and ranking
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-retrieval-consolidation.md (subsystem 2 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- `gatherSources()` decides what reaches the composer and in what order; keep it deterministic and testable (URL and near-duplicate removal, interleave, freshness windows such as 48 hours on curated feeds, an entity-aware query budget inside provider caps).
- Prefer algorithmic ranking; an LLM re-rank is cost of goods and needs a measured win.
- Tune against the weakest audiences (competitor-watch recall) without regressing the strong ones.
- Metrics: duplicate rate, salience@k, freshness-window adherence; golden set: raw bundle → expected ranked set.
