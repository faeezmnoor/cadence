---
paths:
  - "apps/web/server/ai/composer/**"
---
# Summarisation and composition
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-llm-composer.md (subsystem 3 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- Keep the JSON-then-render contract: the composer emits JSON validated by `schema.ts` and rendered by `render.ts`; structural invariants of `prompt.ts` are locked by `test/composer-prompt.test.ts`.
- Inject `distilled_prefs` and the recent raw notes through `feedback-block.ts`; cite sources inline as [n] with a sources footer.
- Faithfulness is a hard gate: never state a price or figure that is not in the sources. Skip an empty section rather than pad it.
- The composer prompt lives in `prompt.ts`; the top-level `prompts/` folder holds the config-agent and extractor prompts only.
- Metrics: the hybrid rubric (composite of grounding, specificity and fit gates; five diagnostic scores advise), faithfulness, length adherence (decision 0012).
