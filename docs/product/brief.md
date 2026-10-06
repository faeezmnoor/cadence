<!-- layer: knowledge · status: living (changes only by decision) · verified: 2026-10-06 · budget: 200 lines -->
# Product brief — Cadence

Sources: decisions 0001–0012, apps/web/server/billing/packs.ts, apps/web/COPY_GUIDE.md §1–§5, and the archived handover's product sections (docs/_archive/2026-10/HANDOVER.md §2–§3, §6, §9), corrected to the decisions where they disagree.

## Who it is for
- Anchor audiences (marketing leads with these three; COPY_GUIDE §2):
  1. Owners of commodity-exposed small businesses (palm oil, poultry, wheat) who need a daily read on prices, regulators and trade news.
  2. Operators at vertical software or mid-market firms who watch competitors' pricing, launches and hires weekly.
  3. Solo consultants and advisors (tax, legal, medical, accounting) who track circulars and regulator notices.
- The product itself stays industry-agnostic: the chat configures any topic, and the landing page keeps a "custom brief" path for everyone else (decision 0001).
- Not served at launch (stack cannot meet the bar today): retail equity investors needing depth, flight and hotel price hunters, government tender watchers.
- Market: Malaysia first (MYR display prices, Malaysian regulators in the curated sources), English briefs.

## The job and the promise
- The job: "keep me current on my industry without paying an analyst or reading everything myself."
- The promise: your own market researcher at a fraction of the cost (decision 0001).
- How it works: the user describes what they follow in a web chat; an AI turns that into a brief configuration; Cadence researches, writes and delivers the brief on the chosen schedule (daily, weekly or monthly) to Telegram.
- The brief learns: feedback taps and tune replies are distilled weekly into a few stable preferences that shape the next brief.
- The moment of value: the first sample brief, sent right after the user links Telegram, already specific to their industry.

## How it earns its keep
- Pre-paid credits; no subscriptions; credits never expire (decision 0002). 1 credit = 1 Standard brief; an Advanced brief costs 5 credits (decision 0008).
- Feedback and tune replies are free forever; trial: 3 free credits, granted once after the first delivered brief (decision 0002; `TRIAL_CREDITS` in packs.ts).

| Pack id (code) | Display name (decision 0010) | Credits | USD | MYR display |
| --- | --- | --- | --- | --- |
| taste | Taste | 30 | $5 | RM 23 |
| standard | Everyday | 70 | $10 | RM 47 |
| power | Power | 200 | $25 | RM 118 |
| pro | Max | 1000 | $100 | RM 470 |

- Every pack clears the 60% gross-margin floor at today's cost-to-us estimate (decision 0002 context; docs/runbooks/stripe-skus-v2.md).
- Card checkout is not live: Stripe waits on the owner's Malaysian KYC (docs/OWNER-QUEUE.md).

## Non-goals
- Not a Bloomberg or equity-research replacement: no real-time prices, estimates or fundamentals depth (decision 0001).
- Not a price or flight alert tracker: threshold alerts are a different product (decision 0001).
- Not a newsfeed or aggregator: Cadence delivers a synthesised brief, not raw items (decision 0001).
- Not "a Telegram bot": Telegram is one delivery channel; copy never leads with it (decision 0001).
- Not a chat assistant: the chat configures the brief; users do not converse with Cadence daily (decision 0001).
- Not a subscription and no plan tiers (decisions 0002, 0010).
- No claim that Advanced is better sourced, "deep research" or cross-checked (decision 0007).

## Constraints
- Copy obeys apps/web/COPY_GUIDE.md: "brief" for the standing config and the delivered message; never "watch", "Pro" or "deep research" (decisions 0003, 0005, 0010).
- Advanced stays paused behind the `PRO_TIER_ALPHA` flag until the eval gate clears `MIN_LEAD = 0.5` (decisions 0009, 0012).
- Personal data: the account deletion path and Sentry scrubbing exist for Malaysian PDPA expectations; soft-deleted users' brief bodies are purged after 30 days.
- Budget: zero-cost data sources first; Brave runs on a grandfathered key (lesson L-13).
- Owner time is the scarcest input: launch gates that need the owner live in docs/OWNER-QUEUE.md.

## Success measures
| Measure | Now | Target |
| --- | --- | --- |
| Consecutive clean daily briefs before public signup (CAD-209) | not recorded in the repo | 14 |
| Advanced lead over Standard on the gating composite (decision 0012) | +0.26 (2026-06 campaign) | ≥ 0.5 with ≥ 5 ratings per arm in 7 days |
| Paying users | 0 (checkout not live) | first paid top-up |
| Gross margin per pack | ≥ 60% at the v1 cost estimate | ≥ 60% measured |
| LLM judge agreement with blinded human ratings (decision 0012) | judge is log-only | Spearman ρ ≥ 0.7 and weighted κ ≥ 0.6 over ≥ 50 pairs |

## Bets in force
- The moat is the chat-configuration wedge plus the self-learning loop, not the data or the channel (decision 0001).
- Usage-aligned credits beat subscriptions for a periodical product (decision 0002).
- Two research depths, Standard and Advanced; Custom (bring your own keys and models) waits for 50 paying users (decisions 0006, 0010).
- Advanced's premium is specificity and fit; closing the grounding gap is open product work (decision 0007).
- Starter cards plus a gallery beat a blank first chat turn (decision 0004).
- A pluggable web-search registry; the Standard default is chosen by eval (decision 0011).
- Quality decisions are made by a measured number, never by impression (decision 0012).

## Glossary
- Brief: what the user configures and what they receive; one delivered brief is the billable unit (decisions 0003, 0005). Banned in UI: "digest" (code only), "watch" (rejected rename).
- Spec (DigestSpec): the versioned JSON configuration of one brief; the current version has `is_current = true`.
- Config agent: the chat model that interviews the user and saves the spec; it calls tools such as propose, update, ask and confirm-and-save.
- Composer: the model that turns spec, sources and learned preferences into the brief (JSON, then rendered text).
- Standard: the default research mode, 1 credit. Advanced: the higher-investment mode, 5 credits, paused behind a flag. Custom: user-chosen stack, deferred (decision 0010). Banned: "Pro", "Pro tier", "deep research".
- Credit: the only billing unit. Pack: a one-time credit bundle (Taste, Everyday, Power, Max). Banned: "plan", "subscription".
- Trial credits: 3 free credits, granted once after the first delivered brief.
- Feedback event: a tap on the brief's inline buttons. Tune reply: a free-text correction the user sends to the bot.
- Learning log: raw feedback notes. Distilled preferences: at most five stable bullets condensed weekly from the log.
- Run (digest run): one execution of the pipeline for one brief on one date; idempotent per user and date.
- Source bundle: the snapshot of everything fetched for one run, kept for replay.
- Sample brief: the immediate first brief sent after Telegram linking, marked as a sample.
- Link token: a single-use, 15-minute, 12-character code in the Telegram deep link.
- Delivery broken: a user state after repeated send failures; the next successful send heals it.
- Cost-to-us: internal cost per run in micro-USD; never shown to users.
- Eval gate: the Advanced release bar, `MIN_LEAD = 0.5` on the composite of grounding, specificity and fit (decision 0012). G-eval: every subsystem change reports a move-or-hold number.
- Golden set: fixed eval cases for one subsystem.
