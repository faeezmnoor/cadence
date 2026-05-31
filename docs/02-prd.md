# 02 — Product Requirements (PRD)

Format: feature → description → acceptance criteria. Grouped by epic.

---

## Epic 1 — Identity & Auth

### F1.1 Magic-link email auth
- **Description:** Passwordless email auth via signed tokens, 15-min TTL.
- **Acceptance:**
  - Email entered → magic link delivered within 30s.
  - Click → web session established for 30 days.
  - Re-using a consumed link returns a clear "expired" UI.

### F1.2 Telegram account linkage
- **Description:** Web account ↔ Telegram chat ID linked via deep-link token.
- **Acceptance:**
  - "Connect Telegram" CTA produces a `t.me/<bot>?start=<token>` link.
  - Token is single-use, 10-min TTL.
  - On bot `/start <token>`, server resolves token, stores `telegram_chat_id`, replies "Linked to <email>".
  - Web app polls or websocket-updates to "Linked ✓" within 5s.

---

## Epic 2 — Chat-based configuration (THE WEDGE)

### F2.1 Configuration agent
- **Description:** A conversational agent that interviews the user and produces a structured `DigestSpec` JSON.
- **Acceptance:**
  - Agent asks ≤ 7 questions in first pass.
  - Output is a validated `DigestSpec` matching schema (see doc 04).
  - User can correct mid-conversation ("actually, weekly not daily") and spec updates live.
  - Conversation persists; reopening web resumes same thread.
  - System prompt is versioned (`config_agent_prompt_v1`, `v2`, ...) for A/B and rollback.

### F2.2 DigestSpec inspector / editor
- **Description:** Read-only view of the structured spec + raw-JSON edit mode (power users).
- **Acceptance:**
  - Plain-language summary card ("Daily at 8am MYT, covering palm oil, MPOB, USDA, CPO futures").
  - "Edit raw" reveals JSON editor with schema validation on save.
  - Save creates a new `DigestSpec` version; previous version retained.

### F2.3 Reconfigure-via-chat
- **Description:** User can re-enter chat with current spec as context and amend it.
- **Acceptance:**
  - Chat opens preloaded with spec summary.
  - User free-text change → agent proposes spec diff → user confirms → new version saved.

---

## Epic 3 — Source ingestion

### F3.1 Web news search connector
- **Description:** Per-digest, fetch top-N relevant news items via Brave Search API (or Perplexity Search).
- **Acceptance:**
  - Query is constructed from `DigestSpec.topics + entities + keywords` per run.
  - Returns ≤ 20 results, deduped by URL.
  - Results cached per (query, day) to avoid duplicate API spend across users.

### F3.2 Commodity / stock price connector
- **Description:** Fetch current + 24h/7d change for tickers and commodity symbols.
- **Acceptance:**
  - Supports tickers via `yfinance` (free, MIT, Python).
  - Supports commodity codes: CPO=F, ZC=F, ZW=F, etc.
  - Returns `{symbol, name, price, currency, change_24h, change_7d, ts}`.

### F3.3 RSS connector
- **Description:** User can add RSS URLs; system polls and includes last 24h items.
- **Acceptance:**
  - Add/remove RSS URL via chat or settings.
  - Feeds polled hourly, items stored with dedup by GUID.
  - Items older than 7 days purged.

### F3.4 Source result cache
- **Description:** Shared cache to amortize API cost across users.
- **Acceptance:**
  - Cache key = `(connector, normalized_query, YYYY-MM-DD)`.
  - TTL 24h.
  - Cache miss rate measurable in metrics dashboard.

---

## Epic 4 — Digest generation

### F4.1 Digest composer (LLM)
- **Description:** Single LLM call composes the final Telegram message from spec + sources + learning log.
- **Acceptance:**
  - Input: `DigestSpec`, fetched source bundle (≤ 12k tokens), last 20 distilled feedback notes.
  - Output: Telegram-safe Markdown ≤ 4000 chars (Telegram limit 4096; reserve buffer).
  - Falls back to multi-message split if content exceeds limit (preserves section integrity).
  - Includes inline links to sources.

### F4.2 Self-learning prompt injection
- **Description:** `LearningLog` entries become part of the composer system prompt.
- **Acceptance:**
  - Most recent 20 distilled notes injected verbatim.
  - When > 20 notes accumulate, a "distill" job condenses older notes into ≤ 5 stable preferences.

### F4.3 Tone / format preset
- **Description:** User picks one of: `executive_brief`, `analyst_detail`, `casual_chat`.
- **Acceptance:**
  - Preset alters composer system prompt only (no model change).
  - Switching preset is instant; reflected in next run.

---

## Epic 5 — Delivery

### F5.1 Telegram delivery
- **Description:** Send composed digest to user's `telegram_chat_id` with feedback buttons.
- **Acceptance:**
  - Successful delivery logged with Telegram message_id.
  - Inline keyboard: 👍 useful, 👎 noise, 🎯 too long, 🔍 more depth.
  - Failures retried with exponential backoff up to 3x; permanent failure flags user as `delivery_broken`.

### F5.2 Scheduler
- **Description:** Per-user cron at the user's chosen local time.
- **Acceptance:**
  - Stored as `delivery_time_local` (HH:MM) + `tz` (IANA).
  - One scheduler job evaluates every minute and dispatches due users.
  - Idempotent — same user can't be sent two digests for same day.

### F5.3 Manual "send sample now"
- **Description:** User-triggered immediate run.
- **Acceptance:**
  - Web button OR Telegram `/sample` command.
  - Rate-limited: 3/day per user.

---

## Epic 6 — Feedback loop

### F6.1 Inline button feedback
- **Description:** Each digest has inline buttons; tapping records a feedback event.
- **Acceptance:**
  - Event includes `(user_id, digest_run_id, signal_type, ts)`.
  - Telegram callback ack within 1s.

### F6.2 `/tune` freeform feedback
- **Description:** `/tune <free text>` command records a learning note.
- **Acceptance:**
  - Command parsed, text saved to LearningLog with `source="tune_command"`.
  - Bot replies with confirmation echoing what it learned.

### F6.3 Distillation job
- **Description:** Periodic job condenses LearningLog into stable preferences.
- **Acceptance:**
  - Runs weekly per user.
  - LLM call distills raw notes → ≤ 5 bullet preferences stored on user profile.
  - Originals retained for audit, but composer uses distilled set + last 5 raw.

---

## Epic 7 — Operations

### F7.1 Per-user cost meter
- **Description:** Track LLM + search API cost per user per day.
- **Acceptance:**
  - Each LLM call / search call logged with token + dollar cost.
  - Admin dashboard shows daily $ / user.

### F7.2 Pause / resume / delete
- **Description:** User controls delivery state.
- **Acceptance:**
  - `/pause`, `/resume` Telegram commands work and reflect in web.
  - Web settings: "Delete my account" wipes user data within 24h and unlinks Telegram.

### F7.3 Admin observability
- **Description:** Faeez can see every digest produced and replay failures.
- **Acceptance:**
  - Internal `/admin` route lists last 100 runs across all users.
  - Each run is replayable (re-runs composer with same inputs).
  - Errors surfaced with stack trace.
