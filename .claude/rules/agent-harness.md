---
paths:
  - "apps/web/server/digest/**"
  - "apps/web/server/inngest/**"
  - "apps/web/server/ai/config-agent/**"
  - "apps/web/server/billing/circuit-breaker.ts"
---
# Agent runtime (the product's own)
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-agent-harness.md (subsystem 9 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- Typed tool calls: the config-agent tools and the composer JSON contract are validated by Zod with retry on drift (the `ComposerJsonError` path).
- Resilience: tier routing, downgrade before charging, per-provider timeouts and the daily cost circuit breaker (`server/billing/circuit-breaker.ts`); never retry into runaway cost.
- Inngest steps stay idempotent on (`user_id`, `run_date`); `digest_runs.sources_bundle` and the admin runs replay are the debugging substrate.
- The setup tool registry is byte-frozen and eval-guarded; manage mode uses its own registry and prompt (`prompts/config_agent_manage_v1.md`).
- Prefer hardening the Vercel AI SDK and Inngest stack over new frameworks.
- Metrics: tool-call success and drift, fallback efficacy, trace completeness, cost-ceiling adherence.
