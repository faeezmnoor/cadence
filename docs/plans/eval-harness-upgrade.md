# Eval Harness Upgrade — PLAN

**Epic:** `CAD-EVAL` (placeholder — file in Linear on reconnect)
**Owner:** `cadence-eval-quality` (subsystem 8)
**Phase:** PLAN artifact (G-plan). Style mirrors `docs/AGENT_TEAM.md`.
**Status:** draft for founder review. No product code changed by this doc.

---

## TL;DR

Cadence's eval today is **three disjoint things** that each measure a sliver and never
gate a merge: a Pro-tier readiness gate built on **human ratings only** (currently
`no_data`), a feedback-loop eval that measures whether the learning loop *runs* (not whether
it *works*), and an extractor precision/recall eval that **isn't in CI**. A Haiku LLM-judge
exists but rides **log-only**. The result: the moat (personalization + faithful, specific
briefs) is **asserted, not measured**, and the launch is bottlenecked on one human's time.

This plan turns eval into the quality backbone the agent team is built around:
1. **P1** — validate the Haiku judge against human ratings, then promote it from log-only to
   the volume scorer (human spot-check at gates); build the **composer golden set** and an
   **automated faithfulness eval**.
2. **P2** — wire offline evals into **CI as the G-eval merge gate** (`/cadence-eval`), with
   **per-subsystem, git-versioned golden datasets**, and **lock ONE rubric** (code-canonical,
   doc-mirrored).
3. **P3** — add a **second validated human rater** (palm-oil trader), **continuous prod
   quality monitoring**, and a **tiered eval-cost policy**.

Stack: a **thin in-repo runner + git-versioned datasets**. No paid eval vendor.

---

## 1. Problem & current state

### 1.1 The three disjoint evals today

| # | What | Where | Measures | Gate? | State |
|---|---|---|---|---|---|
| 1 | **Pro-tier gate** | `apps/web/server/evals/pro-eval-gate.ts` | Human ratings, 3-axis composite (**grounding / specificity / fit**), `MIN_SAMPLES_PER_TIER=5`, `MIN_LEAD=0.5`, `WINDOW_DAYS=7` | Observational only — surfaces a verdict at `/admin/evals`; flips no flag | `ready:false, reason:no_data` (0 Pro briefs ever rated) |
| 2 | **feedback-eval** | `apps/web/server/eval/feedback-eval.ts` | Per-user, 7-day: briefs delivered, keyboard taps, engagement-rate, positive-rate, distilled-prefs-present | No | Operational. Measures the loop *operating*, **not its efficacy** |
| 3 | **extractor eval** | `apps/web/server/eval/run-extractor-eval.ts` | Golden-set P ≥ 0.9 / R ≥ 0.7 on slot extraction | **Not in CI** (hits OpenAI, ~$0.002/run) | Works locally; runs at-will |

Plus: a **Haiku judge rides log-only** (CAD-222 discipline, written to run metadata as an
auto-rating); the `cost_events` table + `server/cost/record.ts` infra already exist.

### 1.2 The seven gaps

| # | Gap | Consequence |
|---|---|---|
| G1 | **Human-only ratings = launch bottleneck** | CAD-209 dogfood bar + CAD-222 Pro gate both wait on Faeez's manual time |
| G2 | **No automated faithfulness / grounding eval** | Hallucinations in a brief are caught only if a human happens to read that brief |
| G3 | **No composer golden set; nothing in CI** | Composer prompt/model changes ship with zero regression guard |
| G4 | **Personalization-lift / loop efficacy unmeasured** | The moat is unproven — we can't show feedback → better next brief |
| G5 | **Single rater, no inter-rater reliability** | One person's taste = the bar; bias is invisible; Pro could ship on vibes |
| G6 | **Rubric drift** | Code used **3 axes** (grounding/specificity/fit); `HANDOVER.md` glossary + AGENT_TEAM §3A used **5 axes** (accuracy/depth/actionability/freshness/readability). **Reconciled 2026-06-14 → hybrid (see §7):** 3-axis composite gates, 5 diagnostic sub-scores; all docs updated to match |
| G7 | **Eval cost not budgeted** | LLM-judge at volume + CI runs have no $/run ceiling or `cost_events` logging |

Internal team consensus (`proposals/appendix-{eng,pm,swe}`): **"golden-set evals in CI, in the
same PR as the change."** This plan is the path to that.

---

## 2. Target metrics

### 2.1 Per-workstream targets

| Workstream | Metric | Target | Scorer tier |
|---|---|---|---|
| Composer quality | Single-rubric composite (see §6) | Hold ≥ baseline on every PR; no axis drops > 0.3 | Judge (volume) + human spot-check |
| **Faithfulness** | Claim-support rate (every claim traces to a source) | **≥ 0.95**; **0** unsupported high-salience claims | Judge (volume) |
| Composer length | Length-target adherence | within ±15% of `length_target` | Deterministic |
| Extractor | Precision / Recall | **P ≥ 0.9 / R ≥ 0.7** (existing floors) | Deterministic |
| Retrieval | Recall / precision @ expected sources | Recall ≥ 0.7, precision ≥ 0.8 (calibrate on first dataset) | Deterministic |
| **Personalization lift** | Δ(rubric or positive-rate) on briefs that incorporated feedback vs control | **> 0** and statistically distinguishable on ≥ 20 paired briefs | Judge + human |
| Pro gate | Pro composite − default composite (lead) | `MIN_LEAD` ≥ 0.5 over `WINDOW_DAYS=7`, `MIN_SAMPLES_PER_TIER=5` (existing) | Human (validated judge may pre-screen volume) |

### 2.2 Judge-validation threshold (the gate on promoting the judge)

**Before** the Haiku judge is promoted from log-only to the volume scorer, it must agree with
the blinded human rater on a held-out validation set:

- **Method:** Spearman rank correlation **ρ** between judge composite and human composite on
  the **same blinded briefs**, plus **Cohen's quadratic-weighted κ** per rubric axis (the axes
  are ordinal 1–5, so weighted κ is the right agreement statistic, not raw % agreement).
- **Threshold:** **Spearman ρ ≥ 0.7 on the composite AND quadratic-weighted κ ≥ 0.6 on each of
  the 3 gate axes** (grounding/specificity/fit). The 5 diagnostic sub-scores ride log-only and are
  not gated on agreement. Below either bar → judge stays log-only and we iterate the judge prompt/rubric.
- **Sample size:** **≥ 50 paired (judge, human) ratings**, stratified across tiers (Pro/default)
  and ICPs, so the correlation isn't an artifact of one cohort. (50 is the floor for a stable
  ρ estimate; below ~30 the CI is too wide to trust.)
- **Re-validation:** re-run this check whenever the judge model or rubric changes; a stale
  validation invalidates the judge's use at gates.

Rationale for 0.7 / 0.6: high enough that the judge can do **volume** scoring (catch
regressions, pre-screen) while we keep **human-at-gate** for release decisions; not so high we
demand the judge be indistinguishable from the human (which no LLM-judge reliably clears on a
5-point aesthetic rubric). This is the standard "judge for volume, human for the gate" split.

---

## 3. Phased plan

### Phase P1 — validate the judge, build composer golden set + faithfulness eval

| Item | Detail |
|---|---|
| **Dataset created** | `apps/web/server/eval/datasets/composer/v1/` — JSONL of `{spec, sources_bundle, expected_notes}` cases (seed ≥ 30, drawn from real `digest_runs.sources_bundle` snapshots, hand-labeled). `datasets/judge-validation/v1/` — ≥ 50 blinded briefs with paired human + judge ratings. |
| **Files / areas touched** | New: `server/eval/datasets/`, `server/eval/run-composer-eval.ts`, `server/eval/faithfulness.ts`, `server/eval/judge.ts` (promote the existing log-only Haiku judge into a callable scorer), `server/eval/judge-validation.ts` (computes ρ + κ). Reuse `pro-eval-gate.ts` aggregation pattern. |
| **Faithfulness eval** | For each composed brief, decompose into atomic claims; judge each claim as supported / unsupported by the `sources_bundle`. Emit claim-support rate + list of unsupported claims. Log-only until it clears its own spot-check. |
| **Plugs into** | `/cadence-eval llm-composer` runs the composer golden set + faithfulness and prints the metric delta. Not yet a hard CI gate (that's P2). |
| **Acceptance criteria** | (a) Composer golden set runs locally and prints rubric + faithfulness + length numbers; (b) judge-validation produces ρ and per-axis κ on ≥ 50 pairs; (c) **if** ρ ≥ 0.7 and κ ≥ 0.6 → judge promoted to volume scorer with human spot-check at gates; **else** judge stays log-only and a follow-up tunes it; (d) faithfulness eval flags ≥ 1 known-bad seeded case (sanity). |

### Phase P2 — CI G-eval gate + versioned per-subsystem datasets + ONE rubric

| Item | Detail |
|---|---|
| **Dataset created** | Versioned dirs per subsystem under `server/eval/datasets/{retrieval,composer,personalization,channel,provider}/vN/`, each with a `manifest.json` (version, rubric ref, case count, last-calibrated date). Git is the version store. |
| **Files / areas touched** | `.github/workflows/` (or existing CI config) — add a **G-eval job** that runs the deterministic + validated-judge golden sets on PRs touching the 9 subsystems; `server/eval/run-all.ts` (orchestrator the CI calls); `/cadence-eval` skill wired so its verdict is the CI artifact. **Rubric reconciliation** (see §7) lands here. |
| **Gate behavior** | A PR **cannot merge** if it drops a subsystem metric past threshold (move-or-hold). Deterministic + validated-judge scorers run in CI; **human-at-gate** stays for release decisions (Pro toggle, dogfood bar). Cost-bounded per §5. |
| **Plugs into** | This **is** the **G-eval** gate in the pipeline (`docs/AGENT_TEAM.md` §3/§4): `… BUILD → REVIEW → [G-eval] → VERIFY …`. `/cadence-eval` produces the verdict; CI enforces it. |
| **Acceptance criteria** | (a) A PR that intentionally regresses the composer rubric **fails CI**; a no-op PR passes; (b) every subsystem golden set is version-pinned with a manifest; (c) **exactly one** rubric exists, defined in code and mirrored in the Notion/doc set (G6 closed); (d) CI G-eval cost stays under the §5 ceiling. |

### Phase P3 — second rater, prod monitoring, tiered cost policy

| Item | Detail |
|---|---|
| **Dataset created** | `datasets/inter-rater/v1/` — briefs rated by both Faeez and the second rater; ongoing prod-sample dataset feeding the monitor. |
| **Files / areas touched** | Rater onboarding into `admin.rateBrief` (second `ratedBy`); `server/eval/inter-rater.ts` (κ between the two humans); a prod-quality monitor (sampled briefs auto-scored by the validated judge, alert on drift); `server/cost/record.ts` extension for the eval-cost tier. |
| **Plugs into** | Continuous monitoring runs on a cron over sampled prod briefs; feeds `/admin/evals`. Inter-rater κ raises confidence in the human gate (mitigates G5). |
| **Acceptance criteria** | (a) Second rater = the **validated palm-oil trader** from the May interviews (per HANDOVER open-decision #3); (b) inter-rater quadratic-weighted κ computed and reported; (c) prod monitor alerts when sampled rubric drifts > 0.3 from the rolling baseline; (d) tiered eval-cost policy active and logging to `cost_events`. |

---

## 4. How it plugs into G-eval + `/cadence-eval`

- **`/cadence-eval <subsystem>`** is the operator-facing entry: identify dataset → record
  baseline → run change → print **metric, baseline, new value, threshold, PASS/FAIL** → extend
  coverage. (Matches the existing skill steps.)
- **G-eval** is the *gate*: in P1 it's advisory (verdict printed), in **P2 it becomes a hard CI
  merge gate**. A FAIL blocks VERIFY. Pre-register the win criterion for any bake-off (CAD-222
  discipline); judges stay blinded.
- Composer/Pro changes **additionally** respect the **Pro eval gate** (`READY` flag in
  `pro-eval-gate.ts`) and the **CAD-209 dogfood bar** — both remain **hard release blockers**,
  untouched by this plan.

---

## 5. Cost model

Tiered scorers — cheapest scorer that can answer runs first:

| Tier | Scorer | When it runs | Rough $/run | Logging |
|---|---|---|---|---|
| 0 | **Deterministic** (P/R, length, dedup, render fidelity) | Every CI run, free | ~$0 | n/a |
| 1 | **Validated LLM-judge** (Haiku) | CI on subsystem-touching PRs; sampled in prod | extractor ≈ **$0.002/run**; composer judge bounded to a **per-PR ceiling** (cap N cases) | **`cost_events` row per judge invocation**, provider string, via `server/cost/record.ts` |
| 2 | **Blinded human** (Faeez; P3 + 2nd rater) | Release gates only (Pro toggle, dogfood bar) | human time, not $ | rating persisted to run metadata |

Policy:
- **CI** runs Tier 0 + a **bounded** Tier 1 (cap case count so a PR's eval cost is predictable
  and small). **Sampled** Tier 1 runs continuously in prod (P3). **Human** is reserved for
  gates — that's the scarce resource we're protecting.
- Every Tier 1 invocation logs `cost_events` (per `apps/web/CLAUDE.md` rule #6 — no LLM path
  without `cost_events`). A monthly eval-cost line is surfaced at `/admin/cost`.
- Set a **per-PR eval-cost ceiling** (e.g. cap judge cases per run) and a **monthly eval
  budget**; exceeding either trips a warning, not a silent overrun.

---

## 6. The moat, made measurable

The two metrics no competitor-by-RSS can fake, and which this plan makes into numbers:

- **Faithfulness / grounding** (§2.1) — every claim in a brief traces to a real source.
  This is the difference between Cadence and a hallucinating summarizer. Target **≥ 0.95
  claim-support, 0 unsupported high-salience claims.** Automated, in CI.
- **Personalization lift** (§2.1, G4) — feedback measurably improves the *next* brief.
  Measured as Δ(rubric or positive-rate) on briefs that incorporated feedback vs a control,
  on paired briefs. This is the self-learning loop's **efficacy**, distinct from feedback-eval's
  loop **operation**. A positive, distinguishable lift is the moat proven.

"The recall set went 0.45 → 0.71, composer rubric held at 4.2, faithfulness 0.97,
personalization lift +0.4, $/brief +$0.003 — ship." That sentence is the deliverable.

---

## 7. Risks + rubric reconciliation

| Risk | Mitigation |
|---|---|
| **Rubric drift (G6)** | **Reconciliation task (P2, must-do):** pick **ONE** rubric, define it **code-canonical** in a single module (e.g. `server/eval/rubric.ts`), **mirror it** in the Notion/doc set. All scorers + `admin.rateBrief` + `pro-eval-gate.ts` import the one definition. **RESOLVED (Faeez, 2026-06-14):** **hybrid** — the 3-axis composite (grounding/specificity/fit) is the canonical **gate** metric; the 5 axes (accuracy/depth/actionability/freshness/readability) become **diagnostic sub-scores** (advisory, never gate). Canonical gate threshold = **`MIN_LEAD=0.5`** (absolute lead); "mean + 1σ" is retired. `server/eval/rubric.ts` defines both sets; only the composite gates. |
| **Judge over-trust** | Judge stays log-only until it clears the §2.2 threshold; even then, human-at-gate for releases. Re-validate on any judge/rubric change. |
| **Dataset rot** | Versioned datasets with manifests + last-calibrated dates; recalibrate thresholds when a dataset version bumps. |
| **Eval cost overrun** | Tiered scorers + per-PR ceiling + monthly budget, all logged to `cost_events` (§5). |
| **Single-rater bias (G5)** | Second validated rater + inter-rater κ in P3. |
| **CI flakiness from LLM calls** | Tier 0 is deterministic and always-on; Tier 1 in CI is bounded and uses fixtures/snapshots where possible; never block a merge on a network blip — judge timeouts degrade to "advisory" not "fail-closed" with an alert. |

**Resolved (Faeez, 2026-06-14): hybrid rubric.** The 3-axis composite (grounding/specificity/fit)
remains the canonical **gate** metric (no migration of the live gate); the 5 axes
(accuracy/depth/actionability/freshness/readability) are added as **diagnostic sub-scores**
(advisory only, never gate). Canonical gate threshold = **`MIN_LEAD=0.5`**. P2 implements this in
`server/eval/rubric.ts`; `admin.rateBrief` keeps emitting the 3 gate axes and additionally
captures the 5 diagnostics.

---

## Guardrails honored

- "brief" in prose; `digest_*` in code references. Credits-only economics (no plan tiers).
- **Pro eval gate + CAD-209 dogfood bar remain hard release blockers** — this plan adds gates,
  removes none.
- Thin in-repo runner + git-versioned datasets — **no paid eval vendor.**
