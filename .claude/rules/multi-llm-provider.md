---
paths:
  - "apps/web/server/ai/providers/**"
  - "apps/web/server/cost/**"
---
# Multi-LLM provider layer
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-multi-llm-provider.md (subsystem 4 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- `getProviders(tier)` in `server/ai/providers/index.ts` is the only call site for tier routing.
- Check current model ids, prices and limits from the provider's documentation before adopting or swapping a model; never pick one from memory.
- Bake-offs compare candidates on the same specs with a win criterion registered before the run; the winner ships, the loser is deleted, an unvalidated judge stays log-only (CAD-222).
- Every routing change reports its cost per brief; the Standard stack stays cheap.
- Metrics: cost per brief, p50 and p95 latency, quality per dollar, routing correctness.
