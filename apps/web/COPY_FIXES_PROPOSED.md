# Cadence copy fixes — proposed backlog (2026-06-11)

Output of the CMO + UX-writer cross-audit. Companion to [COPY_GUIDE.md](./COPY_GUIDE.md) — every fix below applies a guide rule. Status: **proposed, awaiting founder go-ahead.** Verified against live source this date; line numbers may drift.

Severity key: 🔴 honesty/factual bug · 🟠 banned noun or enum leak · 🟡 voice/consistency.

## A. Honesty & factual bugs (🔴 fix first)

| # | File | Current | Proposed |
|---|---|---|---|
| A1 | `components/telegram/link-telegram-client.tsx:102` | "Your trial credits are used. Top-up coming when Stripe lands — your next scheduled brief still arrives at 07:00 MYT." | "Your 3 free briefs are used up. Email {support} to add credits — scheduled briefs are paused until then." **Worst find of the audit: promises delivery the pipeline will skip (`skipped_no_credits`).** |
| A2 | `app/(marketing)/terms/page.tsx:29` | "pause, change, or stop briefs at any time from the chat" | "...from your Cadence dashboard." Pause/archive live on /briefs; a terms inaccuracy is a legal inaccuracy. |
| A3 | `app/app/link/page.tsx:43`, `link-telegram-client.tsx:121,390`, `billing-client.tsx:151` | hard-coded "tomorrow at 07:00 MYT" (5 sites) | Interpolate "{timeLocal} {tz}" from the brief; fallback "tomorrow morning". `billing-client.tsx:151` also asserts a first brief that may not exist → "Your free briefs are ready for when your first brief goes out." |
| A4 | `app/(marketing)/pricing/page.tsx:42` | "Multi-channel cover for a busy desk. 1000 briefs." | "1,000 briefs — for several briefs a day, or a small team." Multi-channel doesn't exist. |
| A5 | `components/marketing/sample-brief.tsx` (content) | "Tuned for: KL plantation trader watching CPO + Bursa planters" + "Your CPO short gets a near-term tailwind… pair-trade is in the money" | Re-cut for Hafiz: "Tuned for: Johor feed mill buying palm kernel + soymeal" + "Both of your main inputs moved the same direction this week — worth checking supplier quotes before Friday." Flagship proof asset currently shows an excluded use case (trading positions) + advice-shaped copy. |
| A6 | `components/marketing/sample-brief.tsx` buttons vs `server/channels/telegram/keyboard.ts:45-50` | Mockup buttons don't match the real keyboard | Mockup adopts the real set: "👍 More like this / 👎 Not for me / 🔥 Loved it / 💤 Skip topic" (pending §9.3 of the guide on the 👎 label). |
| A7 | `app/page.tsx:59-64` | Icon row claims email + Slack "Soon" | WhatsApp icon only + "Next". Honesty line sanctions exactly "Telegram today, WhatsApp next"; icons may not claim what words can't. |
| A8 | `app/(marketing)/how-it-works/page.tsx:20` | "(Telegram is live today; WhatsApp and more on the way.)" | "(Telegram today, WhatsApp next.)" |
| A9 | `app/(marketing)/pricing/page.tsx:60` | "MYR rolling out … shortly." | "MYR pricing for Malaysian customers is coming." No dates we don't control. |

## B. Banned nouns & enum leaks (🟠)

| # | File | Current | Proposed |
|---|---|---|---|
| B1 | `app/briefs/briefs-client.tsx:255` | badge "Pro" | "🔬 Advanced" |
| B2 | `lib/labels.ts:145` | `pro: "Deep research"` | `pro: "Advanced research"` (+ `default: "Standard research"`) |
| B3 | `app/briefs/briefs-client.tsx:431` | "1 cr default · 3 cr Pro" | "1 credit standard · 3 credits advanced" |
| B4 | `app/briefs/briefs-client.tsx:396-458` | "Portfolio burn rate" / "no active burn" / "Runway" / "low — top up" | "Usage & balance" / "No briefs scheduled" / "Lasts about" / "running low — top up" |
| B5 | `app/briefs/[id]/brief-detail-client.tsx:727-734` | raw enums (executive_brief, en, short, daily) on Overview | Route through `formatTone/formatLength/formatLanguage/formatFrequency` |
| B6 | `app/briefs/[id]/brief-detail-client.tsx:446` | raw `{v.createdVia}` | Add `formatCreatedVia` to labels.ts ("Set up in chat" / "Edited on web") |
| B7 | `server/billing/packs.ts` PACK_LABELS | Taste / Standard / Power / Pro | (Pending guide §9.1) Taste-or-Starter / Everyday / Power / Max — display names only, SKUs untouched |
| B8 | `components/billing/tier-explainer.tsx:49,77` | vendor model names on pricing/billing ("Perplexity Sonar Reasoning Pro", "Claude Sonnet 4.6") | "It reads more sources, cross-checks them, and writes a tighter analysis." Model names stay only in the brief-detail transparency table. |
| B9 | `app/settings/learning/learning-client.tsx:20` | raw fall-through `return s` | fallback `prettify(s)` |

## C. Engineer-speak at anxiety moments (🟠)

| # | File | Current | Proposed |
|---|---|---|---|
| C1 | `app/settings/danger/danger-client.tsx:59-66` | "Disassociate…", "Cascade-delete chat threads, feedback, learning log, and digest run records tied to your user ID." | "Remove {email} from Cadence." / "Permanently delete your chat history, your feedback, and everything Cadence has learned about you." |
| C2 | `danger-client.tsx:70` + `danger/page.tsx:39` + `settings/page.tsx:53` | "no 24-hour grace window — delete means delete" / "One-way doors." / "your exit door" | "Deletion is immediate and permanent. There is no undo." / "This can't be undone. Read what gets deleted, then decide." / "Your account, your credits, and how to leave." |
| C3 | `billing-client.tsx:107,116` | "when Stripe MY clears KYC" (×2), "manual credit grant" | "Card payments aren't switched on yet. Email {support} and we'll add credits to your account." |
| C4 | `tune-command.ts:50-56` | "standing instruction I'll bias your next briefs toward" / "(Logged for the weekly distill.)" | "…becomes a standing note I'll follow in every brief from now on." / "Got it — your next briefs will lean that way. Heard: \"{snippet}\"" |
| C5 | `learning-client.tsx:55,64-65,88` | "Locked in" / "Nothing distilled yet. Distill runs weekly — raw inputs…" | "What I've learned" / "Nothing locked in yet. Once a week I go through your reactions and corrections and keep what holds steady." / "Your recent corrections" |
| C6 | `components/chat/chat-client.tsx:69` | "(tool turn)" can render in transcript | Filter content-less turns from hydration (or "Updated your brief setup.") |
| C7 | `lib/chat/multi-topic.ts:115` | "works best for the MVP" | "One topic per brief works best — which one first? You can add more briefs after." |
| C8 | `dispatch.ts:55,134` | "we'll mint you a fresh one" / "coming in the next round" | "we'll send you a fresh one" / "That command isn't ready yet — soon." |

## D. Consistency & voice (🟡)

| # | File | Current | Proposed |
|---|---|---|---|
| D1 | `components/chat/message-bubble.tsx:157,162` | "Spec drafted…" / "Spec saved." | "Brief drafted — review it and reply to confirm or tweak." / "Brief saved." |
| D2 | `billing-client.tsx:71` | "One credit, one brief landed in your inbox." | "1 credit = 1 brief delivered. Credits never expire." |
| D3 | `app/b/[shortId]/page.tsx:197-199` (+ meta :37) | "A senior market researcher in your inbox — for the price of coffee." | "Your own market researcher, every morning — at a fraction of the cost." |
| D4 | `link-telegram-client.tsx:447` | "Open Telegram to connect" | "Connect Telegram" (the canonical action string; bot copy already quotes it) |
| D5 | `app/page.tsx:28` | "Wake up knowing what changed." | "Wake up knowing what changed — and what didn't." |
| D6 | `components/marketing/trust-strip.tsx:5` | "One message a day, that's all" | "One brief every morning — quiet days included." |
| D7 | `app/page.tsx:108,46` | second CTA "Try it on your business"; "3 free briefs. No card needed." | "Start your first brief" (one CTA label product-wide); sub-line "Start free — 3 briefs, no card." |
| D8 | `app/auth/sign-in/page.tsx:41,47,59,63,64,100,112` | "Check your inbox" / "Skip the password ceremony." / "Magic link sent…" / "Send magic link" / "Network error" | "Check your email" / "We'll email you a one-time sign-in link. No password." / "We sent a sign-in link to {email}. Open it on this device." / "Email me a link" / "We couldn't reach the server. Check your connection and try again." |
| D9 | `app/auth/error/page.tsx` | Dead end: "Request a new one." with no affordance | "That sign-in link didn't work" / "It may have expired or already been used — links work once. Get a new one below." + **button "Get a new link" → /auth/sign-in** |
| D10 | `app/settings/page.tsx:30` | "thumbs and tweaks" | "your reactions and corrections" |
| D11 | `spec-sidebar.tsx` | row label "Cadence" (meaning frequency) collides with brand; hard-coded "Channel: Telegram" | "Schedule" row label; channel row sourced from setup once multi-channel exists |

## E. How-it-works + pricing full passes

See the rewrite tables in the audit transcript (2026-06-11 session). Headlines:
- how-it-works H1 "Three steps. Then it's on autopilot." → "Three steps. Then it just shows up." · sub rewritten to core message · "thumbs and tunes" → "You react — it learns" · "an assistant that took your last 14 corrections seriously" → corrections example with verbatim quotes · **new "Day 1 vs day 10" proof block** (provenance-labeled) · "Crypto + your watchlist" example → Mei Ling regulatory example (excluded use case).
- pricing intro/blurbs/trust cards rewritten plain (counts lead every blurb; "you walk" → "you've spent nothing"; "Cancel by stopping" → "Nothing to cancel"); H1 pending guide §9.2.
