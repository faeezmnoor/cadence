# Cadence — UX Writing & Product Marketing Guide (v1)

**Date:** 2026-06-11 · **Authors:** CMO agent + senior UX writer agent (cross-audited), synthesized by Patrick · **Status:** Guide canon approved by process; 3 items pending founder decision (§9) · **Scope:** every user-facing string — marketing pages, app UI, Telegram bot, emails, receipts.

Where this guide conflicts with locked product canon (wedge doc 2026-05-29, ICP audit 2026-06-03, Wave 6 vocabulary), canon wins. Where the product conflicts with this guide, the product is wrong.

---

## 1. Positioning

**The paragraph:** For business owners and operators who need to stay on top of a market but can't justify hiring a researcher, Cadence is your own market researcher at a fraction of the cost. You tell it what to watch — in a normal chat conversation, in your own words — and every morning a short, sourced brief arrives in the messaging app you already use. Unlike doing it yourself across ten tabs and group chats, or settling for generic newsletters and keyword alerts, Cadence is set up by talking and gets better the more you correct it. By week two, the brief reads like it was written for you — because it was.

| Element | Decision |
|---|---|
| Competitive alternatives | (1) DIY: 10 tabs, chat groups, 6am Google. (2) Hiring a junior analyst (RM3k–8k/mo, needs managing). (3) Generic newsletters + Google Alerts (no synthesis, no learning). |
| Unique attributes | Configured by conversation. Self-learning: every correction changes the next brief. Sourced: every claim cites. Delivered where you already chat. Credits that never expire. |
| Value themes | Coverage you couldn't afford before · one message a day replaces an hour of tab-hopping · compounding fit (it improves with use; alternatives don't). |
| Market category | "Your own researcher" — a frame we create. Never categorized as: newsfeed, aggregator, Telegram bot, terminal/Bloomberg, chat assistant, alert/notification tool. |

**Two rules that govern everything:**
1. The wedge is chat-config + the feedback loop — never industry depth. Industries are *examples of what you can watch*, never *what we are*.
2. Never lead with the channel. Telegram (later WhatsApp) is a delivery detail, mentioned as proof of convenience, never as identity.

## 2. Personas (anchor ICPs)

**A. Hafiz — feed mill / poultry SME, Johor.** English is his third language. Trigger: a margin shock noticed too late. *"I only found out the price moved when my supplier told me. By then it was already in my invoice."* Promise: a short morning brief on exactly his inputs, plain language, tappable sources, no card to try, nothing to cancel. Never promise: predictions, trading signals, "never surprised again."

**B. Mei Ling — solo tax practitioner, KL.** Trigger: a client asked about a change she hadn't read. *"My whole value is knowing before my clients ask."* Promise: walk into client conversations already briefed; watch as specific as her practice. Never promise: advice, completeness, a substitute for reading the primary source (we cite precisely so she can).

**C. Daniel — product/ops at a vertical SaaS, Singapore.** Trigger: boss asked "what's [competitor] doing?" and he fumbled. *"I just need to not be the last to know."* Promise: a morning brief on named competitors + relevant regulation, set up in one conversation, cheap enough to expense. Never promise: real-time alerts, scraped private data, "everything your competitor does."

**Long tail:** sales/BD and researchers/journalists — serve them, write nothing for them yet. **Excluded from all marketing, including examples and screenshots:** flights, hotels, equity research at depth, sports betting, gov tenders, crypto. An example is a promise.

## 3. Messaging hierarchy

**Core message:** "Your own market researcher, at a fraction of the cost." If a surface carries one idea, it carries this.

- **Pillar 1 — Set it up by talking.** Proof: a real onboarding exchange shown on-site. Specificity of the example *is* the proof. Lives: landing card 1, how-it-works top half, first-run chat.
- **Pillar 2 — It learns from you (the wedge — protect this pillar).** Proof: the **day-1 vs day-10 pair** — two real briefs with the user's corrections shown between them, provenance labeled ("real corrections, shown with permission" — or visibly marked "illustrative" until a real consenting user exists; fabricated-as-real is prohibited). This is the single most important marketing asset. Lives: landing card 3 + subhead, how-it-works proof block, retention nudges.
- **Pillar 3 — Sourced, short, honest about money.** Proof: a real brief screenshot with visible citations; the pricing page itself. Pillars 1–2 open; pillar 3 closes.

**House rule:** every capability claim in public copy must be reproducible by a skeptical user on day one with 3 free briefs.

## 4. Vocabulary (one term per concept)

| Concept | Canonical | UI chrome forms | Banned variants |
|---|---|---|---|
| Product output | **the brief** | "Briefs" (nav) · "Brief drafted/saved" | digest, spec, report, newsletter, alert, "message" (as the output noun) |
| The configuration | **setup** ("your brief setup", "Setup saved") | "Raw setup (JSON)" allowed only behind the power-user disclosure | spec, config, draft spec |
| Research depths | **standard research / advanced research** (lowercase mid-sentence; sentence case standalone). The footnote concept is **research depth** | Badge: 🔬 Advanced · Header: Advanced research · Toggle: Standard / Advanced | Pro, Pro tier, Default tier, deep research, default, premium, research mode |
| Credit packs | Quantity-words only (see §9 pending: Taste vs Starter; Everyday/Power/Max locked). **Packs use quantity words; depths use quality words — the two vocabularies may never overlap.** | Tile = pack name + price | "Standard"/"Pro" as pack names, tier, plan, subscription |
| Feedback | **react** (👍/👎/🔥/💤) + **tell it what to change**; "correction(s)" allowed as the plain noun | Canonical sentence: "React 👍/👎, or reply with what you'd change." | bias, distill(ed), standing instruction, logged, inputs (noun), nudge, tunes/tweaks (nouns). `/tune` survives only as the literal command |
| Credit sentence | **"1 credit = 1 brief. Advanced research uses 3 or 5 — each option shows its price."** (founder ruling 2026-06-11: per-stack pricing, two advanced depths) | — | "landed in your inbox", burn, runway, "cr" abbreviation |
| Channel (marketing) | "the messaging app you already use" + honesty line **"Telegram today, WhatsApp next"** | — | multi-channel, omnichannel, inbox, channel lists beyond TG+WA |
| Channel (in-app) | Name Telegram plainly on delivery surfaces; nav label stays **Delivery** | The one action string: **"Connect Telegram"** — button, bot copy, errors all quote it verbatim | inbox anywhere; "bot" outside Telegram mechanics (lowercase "the bot" OK when meaning the Telegram endpoint) |
| Disconnect (in-app) | **"Disconnect Telegram"** — the symmetric inverse of "Connect Telegram"; confirm prompt, button, and banner all quote it verbatim | Confirm: "Disconnect Telegram? Briefs can't be delivered until you connect again. Nothing is deleted, and credits aren't touched." | unlink, remove, deactivate, "disconnect delivery" |
| Reconnect (in-app) | **"Reconnect Telegram"** — the broken-state variant of "Connect Telegram", used only when a previously linked chat became unreachable (delivery on hold). Same connect flow, honest about the prior link | Broken-state banner + Delivery card button quote it verbatim | relink, re-link, "fix your connection", reusing "Connect Telegram" when a link existed and broke |
| Delivery-suspended state | **"on hold"** — deliveries while Telegram is disconnected or unreachable. Distinct from the brief lifecycle's "paused" (pause/resume cards); the two never substitute for each other | Banner: "Deliveries are on hold" | paused (for delivery state), stopped, suspended, frozen, disabled |
| Skipped, not charged | The canonical money sentence for occurrences missed while disconnected: **"Deliveries are on hold — no credits are used while disconnected."** Money voice: state the true consequence, numbers/credits first, zero charm | Banner + relink confirmation (+ Telegram if surfaced there) | "you won't be billed", burn, "credits are safe", any paraphrase that drops the no-credits fact |
| Timezone | User-facing copy anchors on **"your local time"**; the IANA zone is shown as the precise label ("your local time (Asia/Kuala_Lumpur)"). Mismatch-banner pattern: state both zones plainly, offer one-tap switch, dismiss names the kept zone ("Keep Kuala Lumpur") | Settings → Account control; suggest banner | TZ, GMT offsets as the only label, "time zone" vs "timezone" mixing (write **timezone**), auto-changing without confirm when briefs exist |
| Persona | **your own market researcher** (marketing) / Cadence | Public permalink: "Prepared by Cadence — a market researcher you set up in chat" | assistant, senior (as researcher modifier), agent, copilot, AI assistant |
| Free start | **"3 free briefs"** · CTA sub-line: **"Start free — 3 briefs, no card."** | The one CTA button label: **"Start your first brief"** | trial credits, "3 free credits" (Terms may define credits once), claim/redeem language |
| Delivery time | Marketing: **"every morning"** only. In-app: **"tomorrow at {time} {tz}"** computed from the brief; fallback "tomorrow morning" | — | any hard-coded clock time ("07:00 MYT") |

**Banned everywhere (all surfaces incl. billing tiles, receipts, bot replies):** Pro tier · Default tier · Pro plan · subscription/plan/membership framing · newsfeed/feed/aggregator/bot-as-identity/alerts/notifications/copilot · real-time/instant/never miss/everything/guaranteed/predict/forecast · revolutionary/game-changing/AI-powered-as-selling-point/supercharge/unlock/10x/seamless/effortless · idioms that don't travel (test: if a 12-year-old non-native reader would pause, rewrite) · inbox · burn/runway · mint · vendor names in user copy (Stripe, KYC, Perplexity/Claude model names — fine-print only).

### 4a. Code vs UI (the "digest" leak guard)

The codebase is built on **`digest`** (`DigestSpec`, `digest_specs`, `digest_runs`, `lib/digest-spec/`, `runDigestPipeline`). That is **internal vocabulary only** — telemetry-load-bearing, don't rename. In **every user-facing string it is a "brief."** Never surface `digest`/`spec`/`DigestSpec` to a user. (UX audit v3, doc 03.)

### 4b. DECIDED (founder, 2026-06-11) — the "brief" overload: keep "brief" for both layers, no rename

"Brief" names both the **delivered artifact** (locked by "1 credit = 1 brief") and the **standing, pausable configuration** (the `/briefs` cards). The audit's proposed rename of the standing layer ("watch") was **rejected by the founder** — "watch" drags in the alert/monitoring mental model §4 bans, and "brief" works like "newsletter": *my brief* (standing) vs *today's brief* (delivered), disambiguated by context. **The binding rule that replaces the rename:** the brief list counts in **briefs** ("3 active briefs"); billing counts in **credits** only — never "73 briefs" as a balance. "1 credit = 1 brief" is the only sentence where the two meet. Enforce this before multi-brief GA. (UX audit v3, doc 03 §3; founder ruling 2026-06-11.)

## 5. Honesty boundaries

| Never say | Say instead |
|---|---|
| "Available on WhatsApp/Slack/Email" | "Telegram today, WhatsApp next." Roadmap only on how-it-works/FAQ, dated as intent. Icons may not claim what words can't. |
| "Real-time" / "instant" / "the moment it happens" | "Every morning, one short brief." |
| "Never miss anything" / "all sources" | "Sources cited in every brief, so you can check anything yourself." |
| Predictions / buy-sell / advice-shaped claims | "Know what moved and why — and decide with the full picture." |
| Excluded use cases as examples (flights, equity-depth, sports, tenders, crypto) | Examples only from commodities, regulation, competitors. |
| "Replaces your analyst" | "Your own market researcher at a fraction of the cost." |
| "Free trial" / "your plan renews" | "Your first 3 briefs are free. No card. Credits never expire." |
| "Like Bloomberg, but cheap" | Compare only to DIY or hiring. |
| "Built for the palm oil industry" (any vertical) | "Watch anything, however specific." |
| Unconditional delivery promises (e.g. "your brief still arrives" when credits = 0 and the pipeline will skip) | State the true consequence, then the fix. |

## 6. Voice & tone

**Person ruling:** **Cadence the researcher says "I"** in chat, bot, and the learning page (it's the researcher's own memory; third-person "Cadence" banned mid-page after introduction). **The company says "we"** on marketing, billing, legal, errors, and destructive surfaces — a persona never apologizes for a payment failure or deletes your data. Never mix "I" and "we" in one message.

| Surface | Speaker | Warmth | Length | Emoji | Example |
|---|---|---|---|---|---|
| Marketing | "we"/"Cadence" | Warm, confident, no hype | ≤16 words avg | Only inside brief mockups | "Tell Cadence what to watch. Every morning, a short, sourced brief." |
| Chat + bot | "I" | Friendly, capable, brief | ≤12 words, one idea/message | 👍 👎 🔥 💤 🔬 only | "Got it — your next briefs will lean that way." |
| Money | "we" | Neutral, precise, zero charm | Numbers up front | None | "70 credits added. Balance: 73." |
| Errors | "we" | Calm, accountable, never cute | ≤8 words what happened, then the fix | None | "That link didn't work. Get a new one below." |
| Destructive | plain second person, no persona | Sober | Short, plain future tense | None | "This deletes your briefs, chat history, and everything Cadence has learned. It can't be undone." |

**Personality budget:** headlines may carry voice; any line adjacent to a number, auth, or deletion is plain.

## 7. Mechanics

- **Sentence case everywhere** — headings, buttons, badges, nav. Styling caps via CSS only. Proper nouns: Cadence, Telegram, WhatsApp.
- **Numerals** for anything countable or money ("3 free briefs", "1 credit = 1 brief", "$5").
- **Dates:** `10 Jun 2026`. No ordinals. **Times:** computed, never hard-coded (§4).
- **Oxford comma:** always. **Em dash:** spaced ` — `, max one per sentence — the brand's pivot punctuation; don't devalue it.
- **Exclamation marks: banned product-wide.** Quiet confidence.
- **Placeholders:** real examples, not types (`you@company.com`, `/tune less crypto`). No angle brackets in user strings.
- **Buttons:** verb-first imperative, ≤3 words where possible. Destructive buttons name the object ("Delete my account"). No trailing punctuation.
- **Error anatomy (3 beats):** ① what happened (plain, no internal nouns) → ② what it means for your brief/money → ③ exactly one action.
- **Empty-state anatomy:** ① what this will show → ② what fills it → ③ one optional action.

## 8. Page-role map

| Surface | The ONE job | Leave them feeling | Single CTA |
|---|---|---|---|
| Landing | Make "your own researcher" feel real + affordable in 30s | Calm relief | "Start your first brief" |
| How it works | Prove the two wedge claims (chat setup + day-1 vs day-10) | Confidence | "Start your first brief" |
| Pricing | Remove money fear (packs, never-expire, no subscription) | Safety — "I can't get trapped" | "Start free — 3 briefs, no card" |
| Sign-in | Get out of the way; zero marketing | Familiarity | Sign in |
| Config chat | One specific watch configured; reward specificity | Being understood | Send first message |
| Brief footer | Harvest corrections | Ownership | "Tell Cadence what to change" |
| Credits | State balance + cost plainly; sell nothing until low | Control | "Top up" (only when low) |

One CTA per surface; a genuine second action is a text link, not a button. The CTA button label is **"Start your first brief"** product-wide.

## 9. Founder decisions (resolved 2026-06-11)

1. **Pack names: Taste / Everyday / Power / Max.** Display names only — Stripe SKUs and enums untouched. Packs use quantity-flavored words; depths use quality words.
2. **Pricing H1: "$5 to start. Pay only for briefs you get."** (literal money-fear job wins on the pricing page; personality budget spent elsewhere).
3. **Keyboard: "👎 Less like this."** Mirrors its own toast; reads as a correction, not a rejection. The marketing mockup mirrors the real keyboard exactly.

## 10. Hero canon (landing)

- H1: **"Wake up knowing what changed."** (founder ruling 2026-06-11: the "— and what didn't" extension was tried and reverted — too long, not catchy. The notify-on-change ambiguity is handled one layer down by trust pill 2, not in the hero.)
- Trust pill 2: **"One brief every morning — quiet days included."** (load-bearing: it's what frees the H1 to stay short)
- When change-only alerting ships as a real mode someday, this H1 family absorbs it without rewriting.
