---
paths:
  - "apps/web/server/channels/**"
  - "apps/web/app/api/telegram/**"
---
# Channels and delivery
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-channels-delivery.md (subsystem 5 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- Every channel implements `ChannelAdapter` (`server/channels/types.ts`); raw `bot.api.sendMessage` is banned outside `server/channels/telegram/` by an ESLint rule (CAD-207).
- WhatsApp, Slack and e-mail folders are scaffolds, not live channels; check their real state before planning.
- WhatsApp Cloud API and Messenger have policy limits (template pre-approval, 24-hour session windows, opt-in) that shape the data model: research them before designing an adapter.
- Telegram messages split at 3800 characters (`server/channels/split.ts`). Webhook or auth changes get the security review lane.
- Metrics: delivery success, render fidelity per channel, split correctness.
