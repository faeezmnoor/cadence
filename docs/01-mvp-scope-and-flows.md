# 01 — MVP Scope & User Flows

## v1 IN scope (ship this)

1. **Web signup** with magic-link email auth (no password).
2. **Telegram bot linkage** via deep-link `/start <token>` flow.
3. **Chat-based digest configuration** on web — single agent conversation produces a structured `DigestSpec`.
4. **DigestSpec editor** — read/inspect/edit the structured spec the agent produced (escape hatch for power users; also debugging surface for Faeez).
5. **Daily digest generation pipeline** — cron → fetch sources → LLM summarize → format Telegram message → deliver.
6. **Source connectors (3 only at MVP):**
   - Generic web news search (Brave Search API or Perplexity Search API).
   - Commodity / stock spot price (Yahoo Finance via `yfinance` or tradingeconomics free tier).
   - RSS feeds (user-supplied URLs, parsed via standard RSS lib).
7. **Telegram delivery** — formatted markdown message; inline reaction buttons for feedback (👍 useful / 👎 noise / 🎯 too long / 🔍 want more depth).
8. **Self-learning loop v1** — feedback events + freeform `/tune <message>` command → appended to a per-user `LearningLog` → injected into next-run system prompt.
9. **Single digest per user** at MVP. Multi-digest deferred.
10. **English only.**
11. **Daily cadence default** with weekly toggle. Monthly deferred.

## v1 OUT (explicitly deferred)

- WhatsApp channel (roadmap, post-revenue).
- Malay / Chinese (v1.1 commitment, post-MVP).
- Multiple digests per user.
- Team / multi-recipient accounts.
- Billing / Stripe (manual invoicing for design partners until WTP proven).
- Native mobile app.
- Source-credibility scoring, paywall handling, deep RAG over user's own documents.
- Voice digest / podcast format.
- Public template marketplace.

## End-to-end user flows

### Flow A — First-time signup → first digest live

```
1. User lands on cadence.app → "Get a daily intelligence brief tailored to your business"
2. Enters email → magic link → authenticated web session
3. Onboarding modal: "Let's design your brief. What do you want to stay on top of?"
4. Chat agent (gpt-4o-mini or claude-haiku) asks 4–7 questions:
     - What industry / business are you in?
     - Which commodities, companies, or tickers should I watch?
     - Any specific keywords or themes (e.g. "EU palm oil regulation")?
     - Live data to include? (prices, FX)
     - Daily or weekly? What local time?
     - Any RSS feeds you already read I should pull from?
     - Preview tone: punchy executive / detailed analyst / casual
5. Agent emits a DigestSpec (JSON). UI shows it in a readable card with "Edit" + "Looks good".
6. "Connect Telegram" CTA → opens t.me/cadence_bot?start=<linkToken>
7. User taps Start in Telegram → bot confirms link → web shows "Linked ✓"
8. "Send me a sample now" button → generates one-shot digest immediately to verify
9. Scheduled cron takes over from next day at user's chosen local time
```

### Flow B — Daily delivery + feedback

```
1. Cron fires per-user at user's local delivery time
2. Worker: load DigestSpec + LearningLog → fetch sources in parallel → LLM compose
3. Telegram message sent with inline buttons: 👍 👎 🎯 (too long) 🔍 (more depth)
4. User taps button OR replies in chat with /tune "less crypto, more palm oil supply news"
5. Feedback event written to LearningLog
6. Next run's system prompt includes the last N=20 distilled feedback notes
```

### Flow C — Reconfigure via chat

```
1. User opens web app → "Edit my brief" → chat resumes with current DigestSpec loaded as context
2. User says "actually I also care about CPO futures" or "drop the FX section"
3. Agent diffs the spec, shows before/after, confirms, persists
4. Optional: "send me a fresh sample now"
```

### Flow D — Pause / resume / cancel

```
- /pause in Telegram → halt scheduled delivery, web shows paused state
- /resume → re-enable
- Web settings → Delete account → wipes data, removes Telegram link
```

## Success criteria for MVP

- 5 design partners receiving daily briefs for 14 consecutive days.
- ≥ 60% of delivered digests get at least one feedback signal (button or /tune).
- ≥ 1 design partner says "I'd pay" with a concrete dollar number.
- Per-user daily LLM cost < USD 0.15 (so a $10/mo plan still has margin).
