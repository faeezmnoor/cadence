---
paths:
  - "apps/web/server/ai/distill/**"
  - "apps/web/server/inngest/functions/weekly-distill.ts"
  - "apps/web/server/inngest/functions/distill-on-signal.ts"
  - "apps/web/server/channels/telegram/inbound/feedback-callback.ts"
  - "apps/web/server/channels/telegram/inbound/tune-command.ts"
---
# Self-learning
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-self-learning.md (subsystem 7 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- The loop: feedback taps and tune replies write `feedback_events` and `learning_log`; distill condenses them into at most five stable `users.distilled_prefs` bullets; the composer injects them.
- Feedback and tune replies stay free, never gated behind credits (decision 0002).
- Guard against over-reacting to one signal and against preference drift; lift is measured, not assumed.
- Metrics: personalisation lift (feedback → next brief), distill stability.
