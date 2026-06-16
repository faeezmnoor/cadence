# Notion Eval Docs — Proposed Revisions

> **DRAFT — reconcile against live Notion content on reconnect.**
> Notion MCP is disconnected, so the two live "Startup - Cadence > Engineering" eval docs
> could **not** be read. The content below is **apply-ready**: written so that on reconnect you
> diff it against the live docs, reconcile wording, and paste. Section headers below map to the
> two docs; adjust to match the live structure.

**Companion plan:** `docs/plans/eval-harness-upgrade.md` (epic `CAD-EVAL`).
**Source of truth:** code is canonical; these docs **mirror** code. Where they disagree, code wins.

---

## Target docs (reconcile names on reconnect)

1. **Doc A — "Eval Harness / Quality"** (the methodology + rubric doc).
2. **Doc B — "Pro Eval Gate / Release Quality"** (the gate + release-blocker doc).

If the live structure differs, fold these sections into the closest existing headings rather
than creating duplicates.

---

## (a) The ONE canonical rubric  → Doc A

> **Replaces** any rubric definition currently in either doc. There must be exactly **one**.

**Canonical rubric lives in code** (`apps/web/server/eval/rubric.ts`, post-reconciliation);
this doc mirrors it. Today the code (`server/evals/pro-eval-gate.ts`) computes a **3-axis**
composite — **grounding, specificity, fit** — while older doc copy references a **5-axis** rubric
(accuracy, depth, actionability, freshness, readability). **These must be unified.**

**RESOLVED (Faeez, 2026-06-14): hybrid rubric.** The 3-axis composite (grounding/specificity/fit)
is the canonical **gate** metric (no migration of the live gate); the 5 axes
(accuracy/depth/actionability/freshness/readability) are **diagnostic sub-scores** (advisory, never
gate). `admin.rateBrief` keeps the 3 gate axes and additionally captures the 5 diagnostics.

Apply-ready rubric block (hybrid — locked):

> **Cadence brief rubric (canonical, mirrors `server/eval/rubric.ts`).** Each axis scored 1–5.
>
> **Gate axes** (the composite — the ONLY thing that gates a release):
> - **Grounding** — every claim is supported by a real, cited source in the brief's source bundle.
> - **Specificity** — concrete numbers, names, dates; not generic market-commentary filler.
> - **Fit** — matches the user's spec (topics, ICP, tone, length).
>
> **Composite = (grounding + specificity + fit) / 3** — aggregated by `pro-eval-gate.ts`; gate threshold `MIN_LEAD=0.5`.
>
> **Diagnostic sub-scores** (advisory; explain *why* a brief is weak; never gate):
> accuracy · depth · actionability · freshness · readability.
>
> `admin.rateBrief` persists the 3 gate axes + the 5 diagnostics. Do not introduce any other axis set.

Add a one-line note: *"Rubric is versioned with the eval datasets; a rubric change bumps the
dataset version and requires judge re-validation (see §c)."*

---

## (b) Golden-set datasets + versioning  → Doc A

> **New section.** Codifies the in-repo, git-versioned dataset model (no vendor).

- Datasets live in-repo under `apps/web/server/eval/datasets/{subsystem}/vN/`, **versioned in
  git**, each with a `manifest.json` (version, rubric ref, case count, last-calibrated date).
- One golden set per subsystem:

| Subsystem | Dataset shape | Metric |
|---|---|---|
| research-search | query → expected sources | recall / precision / freshness |
| retrieval-consolidation | raw bundle → expected ranked/deduped | dedup rate, salience@k |
| **llm-composer** | spec + sources → scored output | **canonical rubric + faithfulness + length** |
| multi-llm-provider | spec across models | quality-per-dollar, p50/p95 latency |
| channels-delivery | ComposedBrief IR → per-channel render | delivery success, render fidelity |
| content-format | structured brief → rendered artifact | fidelity, $/asset, latency |
| self-learning | feedback history → distilled prefs | **personalization lift**, distill stability |

- **Versioning rule:** thresholds are pinned to a dataset version. Bumping a dataset version
  (new cases, relabeled cases, rubric change) requires re-baselining the metric and, if the
  judge is involved, re-validating it.
- Cases are drawn from **real `digest_runs.sources_bundle` snapshots**, hand-labeled — not
  synthetic.

---

## (c) Judge-validation methodology + threshold  → Doc A

> **New section.** Defines when the LLM-judge is allowed to score at the gate.

- The **Haiku judge rides log-only** until validated (CAD-222 discipline). Promotion to volume
  scorer requires clearing a pre-registered agreement bar against the blinded human rater.
- **Method:** **Spearman ρ** between judge and human composite + **Cohen's quadratic-weighted κ**
  per axis (axes are ordinal 1–5).
- **Threshold:** **ρ ≥ 0.7 on composite AND quadratic-weighted κ ≥ 0.6 on every axis.**
- **Sample size:** **≥ 50 paired (judge, human) ratings**, stratified across tier and ICP.
- **On pass:** judge becomes the **volume** scorer; **human spot-checks at release gates**.
- **On fail:** judge stays log-only; iterate the judge prompt/rubric and re-test.
- **Re-validate** on any judge-model or rubric change. A stale validation voids gate use.

State plainly: *"Judge for volume, human for the gate. The judge never makes a release decision
alone until it clears this bar, and even then a human spot-checks at the gate."*

---

## (d) CI G-eval gate  → Doc B

> **New / expanded section.** The move-or-hold merge gate.

- **G-eval** is the merge gate in the delivery pipeline:
  `INTAKE → PLAN → BUILD → REVIEW → [G-eval] → VERIFY → SHIP → CLOSE`.
- A PR touching any of the 9 subsystems runs the relevant golden set in CI. **It cannot merge
  if it drops a subsystem metric past threshold** (move-or-hold; no silent regressions).
- **Scorers in CI:** Tier 0 deterministic (always) + Tier 1 validated judge (bounded case count,
  cost-capped). **Tier 2 human stays for release gates only.**
- Run via the **`/cadence-eval`** skill; its verdict is the CI artifact: *metric, baseline, new
  value, threshold, PASS/FAIL.*
- **Cost:** every judge invocation logs a `cost_events` row (per the no-LLM-path-without-cost
  rule); per-PR eval-cost ceiling + monthly budget enforced; surfaced at `/admin/cost`.
- **Hard release blockers, unchanged:** the **Pro eval gate** (`pro-eval-gate.ts` `READY` flag)
  and the **CAD-209 dogfood bar** remain blocking and are **separate** from the per-PR G-eval.

---

## (e) "Loop health" vs "Output quality" — explicit separation  → Doc A (callout) + Doc B

> **New callout.** This conflation is gap G4 and the single most important framing fix.

Two different things, two different evals — **do not read one as the other:**

| | **Loop health (feedback-eval)** | **Output quality (composer / faithfulness)** |
|---|---|---|
| Question | Is the self-learning loop **operating**? | Is the brief **good and faithful**? |
| Eval | `server/eval/feedback-eval.ts` | composer golden set + faithfulness eval |
| Signals | briefs delivered, keyboard taps, engagement-rate, positive-rate, distilled-prefs-present | canonical rubric, claim-support (faithfulness), length adherence |
| What it proves | The plumbing works (taps land, distill produces prefs) | The product is high-quality and grounded |
| What it does **NOT** prove | That feedback **improved** the next brief | That the loop is even running |

The **moat** — **personalization lift** — is a *third* thing and belongs with output quality:
it measures whether incorporating feedback **measurably improved the next brief** (Δ rubric /
positive-rate on paired briefs). Loop health going green does **not** mean the moat is proven;
only a positive, distinguishable personalization lift does.

---

## Reconcile-and-paste checklist (on Notion reconnect)

1. Read both live docs; map their headings to §(a)–(e) above.
2. Rubric decision **resolved (hybrid: 3-axis composite gates, 5 diagnostic sub-scores)** — paste §(a) as-is.
3. Delete any duplicate/contradictory rubric or threshold copy — canonical threshold is
   **`MIN_LEAD=0.5`** ("mean + 1σ" is retired); canonical rubric is the hybrid block in §(a).
4. Paste §(a)–(e) into the mapped headings; add cross-links to
   `docs/plans/eval-harness-upgrade.md` and the relevant code paths.
5. Confirm "Pro eval gate + CAD-209 dogfood bar = hard release blockers" appears in Doc B.
6. Note the Notion Backlog Status column is **`status` type, not `select`** (don't trip the
   historical sub-agent failure).

---

## Cross-page consistency audit (on reconnect) — Startup-Cadence > Engineering + siblings

> Faeez asked for a full no-duplication / no-conflict sweep across the Notion tree. Notion was
> disconnected when this was written, so it's queued. On reconnect, sweep these pages for the
> SAME rubric/threshold drift fixed in the repo and reconcile to the canonical values below.

**Pages to check:**
- **Engineering → Blueprint** and the **Handover Doc** mirror — rubric axes + gate threshold (likely still "mean + 1σ" / 5-point).
- **Cadence Pro Tier — Higher Stack PRD** (CAD-100) — "Pro mean ≥ default mean + 1σ" + eval-gated language.
- **Monetization** / Pro-tier explainer pages — any quality-bar copy.
- **Decisions Log** — add the **2026-06-14 rubric + threshold ruling** as a logged decision.

**Canonical values to enforce everywhere (single source of truth = code, then these docs):**
- **Rubric (hybrid):** 3-axis **composite** that *gates* — grounding / specificity / fit; 5 **diagnostic** sub-scores (advisory) — accuracy / depth / actionability / freshness / readability.
- **Pro gate threshold:** `MIN_LEAD = 0.5` (Pro composite − default composite), ≥5 ratings/tier, 7-day window. **Retire "mean + 1σ" everywhere.**
- **Judge validation:** Spearman ρ ≥ 0.7 on composite AND quadratic-weighted κ ≥ 0.6 on each of the 3 gate axes, over ≥50 paired ratings.

**Rule:** if a page *contradicts* the above, **flag it to Faeez — do not silently rewrite** strategy/PRD pages; reconcile factual drift (rubric/threshold) directly, escalate anything that changes intent.
