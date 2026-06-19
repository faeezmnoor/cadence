# Cadence — Agent Team & Delivery Pipeline

> **Reading time:** ~18 min (full) / ~5 min (TL;DR + §1 + §2).
> **Status:** PROPOSED playbook (v2 — deep-technical), pending build of the agents/skills/workflow it describes. This doc is the design of record; the implementing files (§9) land after sign-off.
> **Audience:** any Claude Code session (or human) driving Cadence development in VS Code on this Mac.
> **v2 change:** v1 was a generic SDLC squad. v2 adds a **technical specialist bench** with one deep, research-equipped owner per Cadence subsystem, and elevates the **eval harness** and the **product agent runtime harness** to first-class, owned capabilities. Eval-driven development is the central methodology.

---

## TL;DR (read this if nothing else)

Cadence is a **deeply technical AI product** — a research → search → consolidation → summarization → multi-format → multi-channel pipeline with a self-learning loop, across **Perplexity / Claude / OpenAI** and **Telegram / WhatsApp / Messenger**. A generic ship-the-code team can't build that to a high bar. So the team is **three layers**:

- **Layer I — Delivery squad** (lifecycle/process): Orchestrator/PM (you + main session), Architect, Builder, Reviewer, QA, Designer, Bookkeeper, + Security/Debugger on the bench. Owns *how we ship safely*.
- **Layer II — Technical specialist bench** (domain depth): **9 standing, opus, research-equipped agents**, one per subsystem. Pulled onto a ticket by subsystem, so you get depth without paying for all 9 every cycle. Owns *how we build each hard thing well*.
- **Layer III — Cross-cutting harnesses** (first-class capabilities): the **Eval harness** (quality backbone) and the **Agent runtime harness** (Cadence's own production agent runtime). Owns *how we know it's good and keep it robust*.

Central rules: **the Linear ticket is the spine**; **every agent is evidence-first** (research-and-cite before recommending, via `/deep-research` + WebSearch/WebFetch); **every subsystem change must move-or-hold an eval metric** (gate G-eval); and the §7 Cadence guardrails are non-negotiable. This team *complements* OpenClaw/Patrick — Claude Code is the hands-on plan/build/review surface; shared source of truth = Linear + Notion + repo.

---

## 1. The nine subsystems (what the bench owns)

Mapped to the real codebase plus the capabilities to be added. Each subsystem has a **deep owner** (Layer II), **metrics it's accountable for**, and a **golden set** in the eval harness (§3).

| # | Subsystem | Code area | Owner agent | Owns these metrics | Maturity |
|---|---|---|---|---|---|
| 1 | **Research & Search** (ingestion) | `server/sources/{scrape,rss}`, `connectors/`, Perplexity Sonar | `cadence-research-search` | source recall, precision, freshness, coverage per ICP | mature; expanding (6b/6c) |
| 2 | **Consolidation & Ranking** | `server/sources/index.ts` (router, dedup, interleave) | `cadence-retrieval-consolidation` | dedup rate, salience@k, freshness-window adherence | mature; tuning |
| 3 | **Summarization & Composition** | `server/ai/composer/{compose,schema,render}.ts` | `cadence-llm-composer` | rubric composite (grounding/specificity/fit, gates) + diagnostic sub-scores (accuracy/depth/actionability/freshness/readability), faithfulness/hallucination rate, length adherence | mature; quality push |
| 4 | **Multi-LLM provider layer** | `server/ai/providers/*` (`Provider` iface) | `cadence-multi-llm-provider` | $/brief, p50/p95 latency, quality-per-dollar, routing correctness | mature; bake-offs ongoing (CAD-222) |
| 5 | **Channels & Delivery** | `server/channels/*` (ChannelAdapter) | `cadence-channels-delivery` | delivery success, render fidelity per channel, split correctness | Telegram done; **WhatsApp/Messenger NEW** |
| 6 | **Content formats** | composer render + new renderers | `cadence-content-format` | format fidelity, render latency/cost, accessibility | text+TTS done; **video/infographic NEW** |
| 7 | **Self-learning & reinforcement** | `server/ai/distill/*`, `learning_log`, `distilled_prefs` | `cadence-self-learning` | personalization lift (feedback→next-brief), distill stability, regression guard | distill v1 done; **preference modeling/RL NEW** |
| 8 | **Eval & Quality harness** | `server/eval/`, `server/evals/pro-eval-gate.ts` | `cadence-eval-quality` | golden-set coverage, gate calibration, scorer agreement (judge vs human) | scaffold only — **needs to be strong** |
| 9 | **Agent runtime harness** | `server/ai/*` orchestration, `digest/run.ts`, Inngest, providers | `cadence-agent-harness` | tool-call success/drift, retry/fallback efficacy, trace completeness, cost-ceiling adherence | partial — **needs hardening** |

**Implication:** several subsystems are *net-new capability builds* (video/infographic rendering, Messenger + WhatsApp GA adapters, RL-grade self-learning, a generalized eval harness, a coherent agent runtime). The bench is equipped to **research-spike then build** these, not just maintain what exists.

---

## 2. The team

### Layer I — Delivery squad (lifecycle/process)

The **Orchestrator/PM** = your main VS Code session (you + Claude). Owns intake, grilling (`/grill-me`), routing, ship/no-ship, and is the only actor that talks to you. It is backed by a standing **cadence-cofounder** agent — the delivery-orchestration & accountability brain you invoke (or `@cadence-cofounder`) to route a request to the right cast/process and to run a standup that holds every agent + gate accountable end-to-end. The cofounder *plans and tracks*; it never ships (SHIP stays human). It may delegate one level when it helps (Claude Code now supports nested subagents, depth ≤5) but keeps depth ≤2 in practice — usually it names the cast and the main session / `/cadence-deliver` workflow dispatches it.

| Agent | Phase | Wraps | Model |
|---|---|---|---|
| **cadence-cofounder** | ORCHESTRATE (routing + accountability, all phases) | `/cadence-deliver` routing, Linear/Notion/git audit; routes mutations to bookkeeper | opus |
| **cadence-architect** | PLAN | `/grill-me`, `/spec`, `/deep-research`, `/plan-eng-review`, `/plan-ceo-review`, `/office-hours` | opus |
| **cadence-builder** | BUILD (plumbing/coordination) | ported *cadence-build-wave*, *cadence-fix-pass* | sonnet |
| **cadence-reviewer** | REVIEW (correctness/reuse) | `/code-review`, `/review` | opus |
| **cadence-qa** | VERIFY | `/qa`, `/verify`, `/browse` | sonnet |
| **cadence-designer** | DESIGN (∥ UI) | `/design-consultation`, `/design-review`, `/plan-design-review` | sonnet |
| **cadence-bookkeeper** | CLOSE | ported *cadence-bookkeeping* | haiku |
| **cadence-security** *(bench)* | REVIEW gate (sensitive) | `/security-review`, `/cso` | opus |
| **cadence-debugger** *(bench)* | INCIDENT | `/investigate` | sonnet |

The Builder is now a **coordinator + plumbing implementer**: it owns the vertical-slice mechanics (migration, tRPC wiring, UI shell, tests) and **pairs the deep subsystem code to the owning specialist**.

### Layer II — Technical specialist bench (domain depth)

All **opus**, all **research-equipped** (WebSearch, WebFetch, `/deep-research`, doc-lookup), all pre-loaded with the §7 guardrails + this doc + `HANDOVER.md`. Pulled onto a ticket by subsystem. They write the hard code and own their metric.

| Agent | Subsystem (§1) | Extra skills/tools | Typical work |
|---|---|---|---|
| **cadence-research-search** | 1 Research & Search | `/deep-research`, `/browse`, WebSearch/Fetch | new connectors (DDG SERP, GDELT), recall tuning, source coverage per ICP |
| **cadence-retrieval-consolidation** | 2 Consolidation & Ranking | `/deep-research` | dedup/interleave algorithms, entity-aware ranking, freshness windows |
| **cadence-llm-composer** | 3 Summarization & Composition | `/deep-research`, eval harness | prompt engineering, JSON→render, faithfulness, multi-format structuring |
| **cadence-multi-llm-provider** | 4 Multi-LLM layer | `/benchmark-models`, `/deep-research` | provider adapters (Perplexity/Claude/OpenAI), tier routing, model bake-offs |
| **cadence-channels-delivery** | 5 Channels & Delivery | `/deep-research`, `/browse` | ChannelAdapter, **WhatsApp Cloud API + Messenger** adapters, per-channel formatting/templates |
| **cadence-content-format** | 6 Content formats | `/deep-research`, `/design-consultation` | **video + infographic** render pipelines, TTS, accessibility |
| **cadence-self-learning** | 7 Self-learning | `/deep-research`, eval harness | feedback→preference modeling, distill quality, reinforcement, per-user adaptation |
| **cadence-eval-quality** | 8 Eval harness | `/benchmark`, `/benchmark-models`, `/deep-research` | golden sets, blinded scoring, LLM-judge, regression gates, gate calibration |
| **cadence-agent-harness** | 9 Agent runtime | `/deep-research` | typed tool-calling, retries/fallbacks, tracing, cost guards, provider routing runtime |

### Layer III — Cross-cutting harnesses (first-class capabilities)

These are **capabilities the team builds and maintains**, each with a named owner — not just roles.

**(A) Eval harness** *(owner: cadence-eval-quality)* — the quality backbone that makes every gate mean something and unblocks the Pro eval gate. A *strong* eval harness for Cadence =
- **Per-subsystem golden sets:** retrieval (query → expected sources; recall/precision); composer (spec+sources → hybrid rubric: 3-axis composite grounding/specificity/fit that *gates* + 5 diagnostic sub-scores accuracy/depth/actionability/freshness/readability); personalization (feedback → next-brief lift); channel (input → render fidelity); provider (same spec across models → quality-per-dollar).
- **Scorers (3 tiers):** deterministic metrics → **LLM-judge** (Haiku rides log-only today per CAD-222) → **blinded human** (Faeez) for release gates.
- **Regression gates in CI:** a change cannot merge if it drops a subsystem's metric past threshold. Generalizes `server/evals/pro-eval-gate.ts` from "Pro vs default" into a per-subsystem framework.
- **Surfaced** at `/admin/evals`; runnable via the new `/cadence-eval` skill.

**(B) Agent runtime harness** *(owner: cadence-agent-harness)* — Cadence's **production** agent runtime (NOT the dev-team harness). A *strong* runtime =
- **Typed tool-calling contracts:** config-agent's 5 tools + composer JSON contract validated by Zod with retry-on-drift (today's `ComposerJsonError` path, generalized).
- **Provider routing + resilience:** tier→model routing, Pro→default fallback + 2-credit refund, per-provider timeouts, cost ceilings / circuit breakers (some exist; consolidate).
- **Observability + replay:** structured per-step traces to Axiom/Sentry; `digest_runs.sources_bundle` snapshot + `/admin/runs` replay as the debugging substrate.
- **Durability:** Inngest steps idempotent on `(user_id, run_date)`.

---

## 3. Methodology — eval-driven development

The rigor mechanism you asked for. **No subsystem change ships without an eval verdict.**

1. Architect's plan states the **target metric** and the **golden set** the change is judged against.
2. Builder + owning specialist implement; specialist adds/extends the golden-set cases.
3. **Gate G-eval:** the change must **move-or-hold** the subsystem metric (no silent regressions) before VERIFY. Eval-quality runs it.
4. Composer/Pro changes additionally respect the existing **Pro eval gate** + **dogfood bar** (CAD-209).

This is what turns "we think it's better" into "the recall golden set went 0.45 → 0.71, composer rubric held at 4.2, $/brief +$0.003 — ship."

### 3.1 Operating principles (harness discipline)
Drawn from how frontier practitioners actually run agent teams (Karpathy, Garry Tan/gstack, Hashimoto, Willison, Osmani):
- **Thin harness · fat skills · fat code** (Garry Tan). Push fuzzy human judgment into markdown **skills**; push must-be-perfect deterministic work into **code**; keep the harness (CLAUDE.md/AGENTS.md) **thin**. Skills and code carry the weight, not a bloated prompt.
- **Ratchet — engineer the harness, not just the code** (Hashimoto). When an agent makes a mistake, fix the *harness* — `AGENTS.md`, `CLAUDE.md`, a skill, a hook, or a new ADR — so it can't recur. The harness only tightens. This is an explicit step of the automated CLOSE phase (§4).
- **Keep AI on a leash** (Karpathy). Small, verifiable increments; the human owns architecture, taste, and review of every diff. "LLMs automate what you can verify" — so make the generate→verify loop fast (tests + `/qa` + the eval gate).
- **Specs/plans are the source of truth** (Willison/Osmani/Kiro). One plan per ticket from `docs/plans/_TEMPLATE.md`; it is only promotable to BUILD when the machine-checkable "Plan Review — ready for build" gate is filled (G-plan).
- **Lethal trifecta** (Willison). A sub-agent with private data **+** untrusted content **+** external comms is an injection risk — require a human checkpoint (e.g. the Telegram webhook path); `cadence-security` flags it.
- **Doc/decision lifecycle.** Decisions → immutable ADRs in `docs/decisions/`; plans → `docs/plans/` then `_archive/` on ship; `HANDOVER.md` + memory primers are regenerated, never hand-maintained. The CLOSE phase owns all of this automatically — no per-step prompt.

---

## 4. The delivery pipeline

```
                 ┌──────────── you gate every ▣ ────────────┐
INTAKE/GRILL ▣→ PLAN ▣→ BUILD ─┬─ REVIEW ▣→ VERIFY ▣→ SHIP ▣→ CLOSE
   (Orch)       (Arch +     (Builder +│ (Reviewer  (QA +    (Orch)  (Bookkeeper)
                 specialist  owning    │ + eval-q   eval-q)
                 research    specialist│ + security
                 spike)      + designer)│  if sensitive)
                            INCIDENT: Debugger ↔ Builder/specialist
```

### Phase detail
0. **INTAKE / GRILL** *(Orchestrator)* — classify work-type (`fix`/`feature`/`epic`/`incident`/`design`/`strategy`/**`research-spike`**) **and tag the subsystem(s)** (§1). Resolve ambiguity with `/grill-me`. Output: brief + work-type + subsystem tags + `CAD-N`.
1. **PLAN** *(Architect + owning specialist)* — for any non-trivial subsystem change, a **`/deep-research` spike first** (state of the art, provider docs, trade-offs), then `docs/plans/CAD-N.md`: approach, file-level changes, **target metric + golden set**, risks, gates. Strategy → `/plan-ceo-review`; arch → `/plan-eng-review`. **G-plan: you approve.**
2. **BUILD** *(Builder coordinates; owning specialist writes the deep code; Designer ∥ for UI)* — vertical slice (`schema → server → tRPC → UI → tests`), specialist extends the golden set, one commit per stage, push per stage.
3. **REVIEW** *(Reviewer + eval-quality; + Security on sensitive diffs)* — correctness/reuse review **and** eval verdict. Security auto-gate fires for auth/billing/secrets/RLS/webhook/BYO-key/admin diffs. **G-review: zero unresolved P0/P1. G-eval: metric moved-or-held.**
4. **VERIFY** *(QA + eval-quality)* — runtime acceptance (`/verify`, `/qa`, `/browse`) + eval re-run on the preview. **G-verify: criteria pass; composer/Pro respect eval gate + dogfood bar.**
5. **SHIP** *(Orchestrator)* — `/ship` or `/land-and-deploy`, Vercel deploy, optional `/canary`.
6. **CLOSE** *(Bookkeeper, automated via `/cadence-deliver phase:close`)* — runs with no per-step prompting: archive the plan to `docs/plans/_archive/` (SHIPPED header) → Linear `Done` + Notion mirror + decisions index → append `CHANGELOG.md` → regenerate `HANDOVER.md` + memory primers → `/sync-gbrain` → **Ratchet** harness-hardening pass (§3.1).

### Gates
| Gate | Blocks | Owner |
|---|---|---|
| **G-plan** | BUILD | You (CEO/eng-review for strategy/arch) |
| **G-review** | VERIFY | Reviewer (+Security) |
| **G-eval** | VERIFY | Eval-quality — *subsystem metric moved-or-held* |
| **G-verify** | SHIP | QA (+ Pro eval gate + dogfood bar for composer/Pro) |
| **G-cadence** | any | Orchestrator — §7 guardrails, continuous |

---

## 5. Collaboration & handoffs

- **Spine:** every run pinned to `CAD-N`; INTAKE creates the ticket (via bookkeeper) if missing.
- **Specialist embedding:** the pipeline phases stay fixed; the *cast* changes by subsystem tag. A "competitor-watch recall" ticket pulls `research-search` + `retrieval-consolidation` + `eval-quality`. A "WhatsApp GA" ticket pulls `channels-delivery` + `agent-harness` + `security`. A "video brief" ticket pulls `content-format` + `llm-composer` + `designer`.
- **Artifact handoffs (not chat handoffs):** PLAN → `docs/plans/CAD-N.md` (incl. target metric + golden set); BUILD → branch + commits; REVIEW → findings + eval verdict; VERIFY → QA report appended to plan; CLOSE → Linear/Notion/`ticket-map`.
- **Always-orchestrated model:** the committed Workflow (`.claude/workflows/cadence-deliver.js`, run via `/cadence-deliver`) threads PLAN→BUILD→REVIEW→VERIFY deterministically, runs **parallel adversarial reviewers** in REVIEW, and **scales the cast to `workType` × subsystem tags**: `fix` = builder + 1 reviewer; `feature` = + owning specialist + designer + eval-quality; `epic` = full relevant bench + security + 3-way adversarial review. SHIP + CLOSE stay human-gated.
- **Escape hatch:** invoke any agent directly (`@cadence-llm-composer ...`) for a focused consult without the full pipeline.

---

## 6. Skill map — reuse / port / create

**Reuse as-is (already run in Claude Code):** `/grill-me` · `/spec` · `/office-hours` · `/deep-research` · `/plan-ceo-review` · `/plan-eng-review` · `/plan-design-review` · `/plan-devex-review` · `/autoplan` · `/design-consultation` · `/design-review` · `/code-review` · `/review` · `/security-review` · `/investigate` · `/qa` · `/qa-only` · `/verify` · `/ship` · `/land-and-deploy` · `/canary` · `/browse` · `/benchmark` · `/benchmark-models` · `/cso` · `/skill-creator`

**Port to Claude-Code-native** (strip OpenClaw cron/heartbeat/Telegram/Linux-path machinery; target this Mac's single repo `/Users/faeez/dev/projects/cadence`, app at `apps/web`, Linear/Notion via MCP):

| Original | Port | Key changes |
|---|---|---|
| `ocw-cadence-phase-build-wave` | `cadence-build-wave` | Mac paths; `apps/web`; tRPC under `server/trpc`; `apply-NNNN.mjs`; no heartbeat |
| `ocw-cadence-fix-pass` | `cadence-fix-pass` | Mac paths; no `cd cadence/app`; no `agent-progress.sh` |
| `ocw-cadence-handover-artifact` | `cadence-handover` | Mac paths; Notion via MCP |
| `ocw-linear-notion-bookkeeping` | `cadence-bookkeeping` | Linear + Notion MCP; `ticket-map.json`; CC memory dir |

**Create new:**
| New skill | Owner | Purpose |
|---|---|---|
| `/cadence-deliver` | Orchestrator | Pipeline entry: classify work-type + subsystem, create/link `CAD-N`, launch the workflow at the right cast |
| `/cadence-eval` | eval-quality | Run/extend a subsystem golden set; print metric deltas; the G-eval mechanism |

---

## 7. Cadence guardrails (every agent obeys)

1. **Terminology:** `digest_*` in code; **"a brief"** in UI — "brief" names BOTH the standing config and the delivered artifact (disambiguated by context). "Cadence" is a sacred brand noun. The proposed **"watch"** rename (D-005/CAD-227) was **REJECTED by the founder 2026-06-19** — do not use "watch" as the standing-config noun anywhere.
2. **Positioning:** lead with *"your own market researcher at a fraction of the cost."* Never lead with Telegram. Anti-positioning: not Bloomberg, not a price/flight tracker, not a newsfeed, not a "Telegram bot," not a chat assistant, not a subscription.
3. **Monetization:** credits-only, no subscriptions, **no plan-tier nouns**. Research modes = **Standard (1 credit) / Advanced (5 credits) / Custom** (D-006/D-008/D-010); **never "Pro" or "deep research" in any user-facing form** ("Pro" is retired). Advanced sells **specificity + fit, NOT better grounding** (D-007). Credit-pack display names = Taste/Everyday/Power/Max. `/tune` + feedback free forever.
4. **Composer/Pro quality:** respect the eval gate (`server/evals/pro-eval-gate.ts`) + dogfood bar (CAD-209); Pro stays behind `PRO_TIER_ALPHA`.
5. **Repo discipline:** never edit an applied `apply-NNNN.mjs` (forward-fix only); `docs/*` numbered files are a generated mirror — don't treat as canonical source; one logical change per commit, push per stage; no `git add -A`, no `--no-verify`.
6. **Cadence ≠ LiveWheel.** Different repo, ICP, Linear team (CAD vs LWL), Notion tree.
7. **Evidence-first.** On the 9 subsystems, research-and-cite (benchmarks, papers, provider docs) before recommending; no architecture-from-memory.

---

## 8. Capability roadmap (mature vs net-new the bench will build)

- **Mature, tuning:** research/search ingestion, consolidation, composer, multi-LLM routing, Telegram channel, distill v1, eval *scaffold*.
- **Net-new (research-spike → build):** generalized **eval harness** (§3A) · hardened **agent runtime harness** (§3B) · **WhatsApp Cloud API** + **Messenger** adapters · **video** + **infographic** content formats · **RL-grade self-learning** (preference modeling beyond weekly distill) · automated **multi-LLM bake-off** tooling.

---

## 9. File manifest (built after sign-off)

All **repo-local + git-committed**.

```
cadence/
├── docs/
│   ├── AGENT_TEAM.md                       ← this doc
│   └── plans/                              ← per-ticket plan artifacts (runtime)
├── .claude/
│   ├── agents/
│   │   ├── cadence-architect.md            ┐
│   │   ├── cadence-builder.md              │ Layer I — delivery squad (8)
│   │   ├── cadence-reviewer.md             │
│   │   ├── cadence-qa.md                   │
│   │   ├── cadence-designer.md             │
│   │   ├── cadence-bookkeeper.md           │
│   │   ├── cadence-security.md             │
│   │   ├── cadence-debugger.md             ┘
│   │   ├── cadence-research-search.md      ┐
│   │   ├── cadence-retrieval-consolidation.md │ Layer II — specialist bench (9)
│   │   ├── cadence-llm-composer.md         │
│   │   ├── cadence-multi-llm-provider.md   │
│   │   ├── cadence-channels-delivery.md    │
│   │   ├── cadence-content-format.md       │
│   │   ├── cadence-self-learning.md        │
│   │   ├── cadence-eval-quality.md         │
│   │   └── cadence-agent-harness.md        ┘
│   ├── skills/
│   │   ├── cadence-build-wave/SKILL.md
│   │   ├── cadence-fix-pass/SKILL.md
│   │   ├── cadence-handover/SKILL.md
│   │   ├── cadence-bookkeeping/SKILL.md
│   │   ├── cadence-deliver/SKILL.md
│   │   └── cadence-eval/SKILL.md
│   └── workflows/
│       └── cadence-deliver.js
└── CLAUDE.md                               ← +"Delivery pipeline & agent team" section
```
**17 agent files** (8 + 9) + **6 skills** + **1 workflow** + CLAUDE.md section + memory file `cadence-agent-team` (+ MEMORY.md index line).

---

## 10. Glossary

- **Layer I / II / III** — delivery squad / specialist bench / cross-cutting harnesses.
- **Subsystem tag** — one of the 9 (§1); set at INTAKE; selects which specialists join.
- **Golden set** — fixed eval cases for a subsystem; the basis of G-eval.
- **G-eval** — gate: a subsystem change must move-or-hold its metric before VERIFY.
- **Eval harness / Agent runtime harness** — the two Layer-III capabilities (§3A/§3B). The agent harness is the **product's** runtime, not the dev team's.
- **Research spike** — a `/deep-research` pass the Architect/specialist runs before planning a novel subsystem.
- **Cast** — the specific agents the workflow spawns for a ticket (= workType × subsystem tags).
- **Port** — Claude-Code-native rewrite of an OpenClaw skill with cron/heartbeat/Telegram/Linux machinery removed.

---

## 11. Pitfalls — if you see X, do Y

- **Generalist building a hard subsystem** → the subsystem tag was missing at INTAKE; the owning specialist wasn't pulled in. Re-tag and re-route.
- **"It's better" with no number** → G-eval was skipped. No subsystem ship without a metric delta.
- **Agent reading stale OpenClaw paths** → use the *ported* skills; repo is `/Users/faeez/dev/projects/cadence`, app in `apps/web`.
- **Workflow spawned the whole bench for a typo fix** → wrong work-type tag; re-tag `fix` or use the `@agent` escape hatch.
- **New content format / channel proposed from memory** → run the `/deep-research` spike first (evidence-first); provider APIs (WhatsApp templates, Messenger policy) have hard constraints that must shape the plan.
- **Two agents editing the same files in parallel** → only BUILD mutates the tree; give parallel builders `isolation: 'worktree'` or serialize.
