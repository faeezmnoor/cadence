---
paths:
  - "apps/web/server/sources/rss/**"
  - "apps/web/server/sources/scrape/**"
  - "apps/web/server/sources/types.ts"
  - "apps/web/server/connectors/**"
  - "apps/web/server/ai/providers/perplexity.ts"
  - "apps/web/server/ai/providers/duckduckgo.ts"
  - "apps/web/server/ai/providers/searchers.ts"
---
# Research and search (ingestion)
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-research-search.md (subsystem 1 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- Before adding or changing a source, check its API limits, rate caps, terms and anti-bot posture, and cite them in the slice plan.
- Every source returns the locked `NormalizedSourceItem` shape (`server/sources/types.ts`) and never throws.
- Brave's free tier ended on 2026-02-12: no Brave-only feature without an exit plan (lesson L-13); GDELT allows under one query per second; scrapers drift, so a zero-row fetch must stay visible.
- Prefer zero-cost sources first; respect rate limits with backoff.
- Metrics: source recall, precision, freshness, coverage per audience; golden set: query → expected sources.
