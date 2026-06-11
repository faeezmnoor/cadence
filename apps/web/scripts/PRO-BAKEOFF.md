# Pro integrity bake-off (CAD-222)

The advanced tier is product-paused. Two research stacks compete for it;
this runbook drives the 10-briefs × 2-contenders × 5-specs bake-off
(~$20 budget). The loser gets **deleted** from the codebase.

## Pre-registered decision criterion (verbatim)

> A3 wins ties; ≥0.5 composite lift at ≤$0.10/brief un-pauses the tier;
> loser gets DELETED.

Notes on how that maps to tooling:

- **Head-to-head winner** (A2 `perplexity_sonnet` vs A3
  `sonnet_websearch`): higher mean composite in this report; A3 wins
  ties. Decided by `decideWinner` in `scripts/pro-bakeoff/lib.ts`.
- **≥0.5 composite lift**: measured against the *default-tier baseline*
  via the existing manual-rating gate
  (`server/evals/pro-eval-gate.ts`, `MIN_LEAD = 0.5`) — the founder
  rates briefs in /admin; this report's Haiku-judge scores are the
  cheap pre-filter, not the un-pause authority.
- **≤$0.10/brief**: the report flags whether the winner's mean
  cost-per-brief clears the ceiling (`winnerMeetsCostCeiling`).

## The contenders

| id | stack | search step |
|---|---|---|
| `perplexity_sonnet` (A2) | Perplexity Sonar Reasoning Pro → Pro Sonnet composer. Sonar's synthesized answer is now KEPT (`SearchResponse.memo`) and fed to the composer as a verify-against-sources research memo. | explicit, per topic |
| `sonnet_websearch` (A3) | Pro Sonnet composer with the Anthropic native `web_search_20250305` server tool (2-3 targeted searches, results folded into the brief's numbered sources). | inline — none |

Both run the SAME shared compose/repair driver and emit the same
`BriefJson`. Seam: `getBakeoffStack(contender)` in
`server/ai/providers/index.ts`. `PRO_TIER_ALPHA` routing is untouched.

## 1. Export 5 real specs

Spec files are JSON: `{ "name": "<label>", "spec": <DigestSpecV1> }` —
validated against `lib/digest-spec/schema.ts` before any spend. Two
example fixtures (anchor ICPs) live in `scripts/pro-bakeoff/specs/`.

Export real specs from prod (psql against the Supabase pooler; the
runner itself never touches the database):

```sql
-- pick 5 current, non-smoke specs across distinct users/ICPs
SELECT id, spec FROM digest_specs
WHERE is_current = true AND is_smoke = false
LIMIT 5;
```

Save each `spec` column value into its own file:

```json
{ "name": "user-1234-palm-oil", "spec": { ...spec column JSON... } }
```

Scrub anything identifying from `name` — names end up in the report.

## 2. Test the harness (no keys, no spend)

```bash
cd apps/web
npx tsx scripts/pro-bakeoff.ts --dry-run
```

Mocks every model call, exercises spec loading → run loop → aggregation
→ report writing end-to-end.

## 3. Run both contenders

```bash
cd apps/web
# .env.local must have ANTHROPIC_API_KEY + PERPLEXITY_API_KEY
npx tsx --env-file=.env.local scripts/pro-bakeoff.ts \
  --contender both \
  --runs 1 \
  --specs scripts/pro-bakeoff/specs \
  --out scripts/pro-bakeoff/reports
```

- `--contender perplexity_sonnet | sonnet_websearch | both`
- `--runs N` — briefs per spec per contender (5 specs × 2 contenders ×
  1 run = the 10-brief design)
- Budget sanity: A2 ≈ $0.15–0.45/brief (search-heavy), A3 ≈ tokens +
  ~$0.01/search surcharge (see `ANTHROPIC_WEB_SEARCH_PER_1K_USD` in
  `server/cost/record.ts` — **pricing constant is an unverified
  estimate, check the TODO there before trusting cost figures**).
- Failed runs are logged and skipped, not fatal — re-run a single
  contender/spec by pointing `--specs` at a directory with just that
  file.

## 4. Read the report

Two files per run in `--out`, timestamped:

- `pro-bakeoff-<ts>.json` — every brief (JSON + markdown), per-run
  judge scores (grounding / specificity / fit, 1-5), token + dollar
  figures, aggregates, verdict.
- `pro-bakeoff-<ts>.md` — summary tables: per-contender aggregates,
  verdict block, per-run scores.

Read order: verdict block → per-contender `Mean $/brief` vs the $0.10
ceiling → spot-read the 2-3 lowest-grounding briefs in the JSON to
check the judge isn't being gamed (memo-only claims for A2, invented
URLs for A3).

Then: founder-rate the winner's briefs in /admin (that populates the
real eval gate), and apply the criterion above.
