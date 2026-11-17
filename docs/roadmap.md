<!-- layer: state · status: living · verified: 2026-11-17 · budget: 30 lines -->
# Roadmap — Cadence

Direction: prove the brief is worth paying for (dogfood bar, Advanced eval gate) before opening checkout and public signup (decisions 0009, 0012). Source: Linear team CAD, export of 2026-10-06; Linear mirrors this file.

## Now
- CAD-222 — Advanced integrity bake-off → tier decision (waits on: OQ-05, OQ-06)
- CAD-215 — credit bridge and Advanced tier pause (waits on: OQ-05)
- CAD-216 — nightly database backup off-site (waits on: OQ-02, then close)
- CAD-210 — platform audit 2026-06-11, three-wave ship plan, epic (waits on: OQ-05); plan of record: docs/records/audits/platform-audit-2026-06-11.md

## Next
- Zod 4 with AI SDK 5 — removes the Zod audit exception (decision 0013, option A); a pipeline major, so it needs the G-eval move-or-hold number (decision 0012)
- Burst limit on tRPC mutations — about five worst-case requests at once on one instance pass 2 GB (slice 005 review round 2); a per-instance concurrency or per-user burst cap until option A lands (decision 0013)
- Bound `chat.appendMessage` content — stored as `z.unknown()` jsonb, now at most the 384 KiB body (was 50–100 MB from a 1.5 KB body before the slice 005 input guard); a schema for the two content kinds the client writes
- Cap path length in the tRPC input guard — one signed-in 384 KiB POST with long same-length paths costs about 7 s of CPU in the guard (slice 005 review round 3, R3-1, P2); about 256 characters per segment and 1,024 per path
- Tests for two input-guard rules — an invalid path escape and `constructor` or `prototype` as a segment (slice 005 review round 3, R3-2, P3)
- CAD-70, CAD-71, CAD-72 — config-agent tasks T-408 to T-410 (Urgent)
- CAD-228 — web-search providers: keep all, Standard default decided by evals before launch (High; decision 0011)
- CAD-73 to CAD-76 — config-agent and composer tasks T-411 to T-414 (High)

## Later
- CAD-77 — composer prompt v2 (Medium)
- CAD-123 — free data sources epic: CAD-124 DuckDuckGo HTML scrape, CAD-125 to CAD-130 connectors (CoinGecko, eBay, Odds API, Kiwi, Google News RSS, scraper dashboard)
- CAD-122 — update the blueprint architecture note for the Brave free-tier end
- CAD-238 — eval harness upgrade, CI G-eval gate (draft plan: docs/records/plans/eval-harness-upgrade.md; state not in the export)

## Done
- 005 zod-guard — request guards for GHSA-mrhx-c7xc-m3w5, option B of decision 0013; merged 2026-11-17 (PR #58, 39a29c1); records: docs/records/slices/005-zod-guard
