# Cadence — Development Blueprint

> Source of truth for implementation. Locked 2026-05-30.
> Owner: Faeez (solo). Co-founder agent: `cadence-cofounder`.
> Status: pre-code, ready for Phase 0 kickoff.

## Documents

1. [01 — MVP Scope & User Flows](./01-mvp-scope-and-flows.md)
2. [02 — Product Requirements (PRD)](./02-prd.md)
3. [03 — Architecture & Tech Stack](./03-architecture.md)
4. [04 — Data Model & API Design](./04-data-model-and-apis.md)
5. [05 — Roadmap, Phases & Task Backlog](./05-roadmap-and-tasks.md)

> All 5 docs are locked and ready to push to Notion. Push is blocked on `ntn login` on this host (see open question #4).

## North Star (locked, do not re-litigate)

- **Wedge:** chat-based AI configuration of digests. The chat-config + self-learning feedback loop is the moat. NOT industry depth.
- **ICP for GTM (not product constraint):** commodity-exposed SMEs (palm oil, chicken, wheat, cooking oil).
- **Channel:** Telegram Bot DM only at MVP. WhatsApp deferred.
- **Language:** English only at MVP. Malay + Chinese committed for v1.1.
- **Cadence default:** daily. Weekly/monthly optional.
- **Core IP:** the agent that translates messy chat intent into a structured, evolving digest spec — and the feedback loop that tunes it.

## Hard wall

Cadence is NOT LiveWheel. Do not import LiveWheel architecture choices, infra, or memory entries. See memory `feedback_keep_projects_separate.md`.

## Open questions (Faeez to resolve before Phase 1 ends)

1. Pricing model + WTP signal (target: 2 design-partner interviews before Phase 1 close).
2. Commodity data sources per design partner (start palm oil → MPOB + tradingeconomics).
3. Telegram-as-stopgap acceptance from the 2 WA-native validated users.
4. Notion token / `ntn login` so the next session can push this blueprint into the Cadence Notion tree.
