---
paths:
  - "apps/web/server/ai/composer/render.ts"
  - "apps/web/server/channels/telegram/format.ts"
---
# Content formats
Rehomed 2026-10-06 from the archived agent file docs/_archive/2026-10/_claude/agents/cadence-content-format.md (subsystem 6 in docs/architecture/overview.md). Every change here reports a move-or-hold eval number (decision 0012; skill cadence-eval).
- Formats render the composer's structured brief; they never summarise again. Keep renderers pluggable, mirroring the channel adapters.
- Video and infographic renderers do not exist yet; any new format reports cost per asset and latency before it ships and keeps inside the credit margin.
- Accessibility: captions and alt text for every visual format.
- Metrics: format fidelity, render latency, cost per asset.
