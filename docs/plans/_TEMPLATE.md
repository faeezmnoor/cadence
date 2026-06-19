# CAD-N — <title>

> Status: proposed → accepted → shipped → superseded
> Owner: <specialist/agent> · Created: <YYYY-MM-DD> · Work-type: fix | feature | epic | incident | design | strategy | research-spike · Subsystems: <tags>

## 1. Problem & why now
What's broken or missing, and why it's worth doing now. Link the Linear ticket.

## 2. Constitution check
Does this respect the §7 guardrails + locked decisions (`docs/decisions/`)? Note any decision it touches or proposes to change (→ that needs a new ADR).

## 3. Clarifications resolved
Open questions that had to be answered before build (kill ambiguity here, not mid-build). Each: Q → decision.

## 4. Researched approach (evidence-first)
The chosen approach + the alternatives considered, with `/deep-research` citations. No architecture-from-memory on the 9 subsystems.

## 5. File-level change list
Concrete files to add/change, with one-line intent each. Call out migrations, tRPC surfaces, UI, tests.

## 6. Target eval metric + golden set (G-eval basis)
The subsystem metric this must move-or-hold, the golden set it's judged against, baseline, and the threshold. **No metric → not a plan.**

## 7. Tasks
Ordered, executable. Mark parallelizable tasks `[P]`. Each task = one logical commit.

## 8. Risks & gates
Risks + mitigations. Which gates apply: G-plan / G-review / G-eval / G-verify / SHIP. Note if `cadence-security` is pulled (sensitive diff) and any lethal-trifecta exposure.

## 9. Acceptance criteria
Observable behaviour that proves success (what QA verifies at G-verify).

---
## ✅ Plan Review — ready for build
*(This section is the machine-checkable gate: the plan is NOT promotable to BUILD until this is filled in and Faeez approves — G-plan.)*
- [ ] Sections 1–9 complete; metric + golden set named (§6)
- [ ] Constitution check passed (§2); any decision change has/needs an ADR
- [ ] Reviewer note: <who reviewed, verdict>
- [ ] **G-plan approved by Faeez:** <date>
