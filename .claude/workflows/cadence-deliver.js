export const meta = {
  name: 'cadence-deliver',
  description: 'Cadence delivery pipeline — PLAN → BUILD → REVIEW → VERIFY with a cast scaled to work-type and subsystem. Stops before SHIP (human-gated).',
  whenToUse: 'Run via /cadence-deliver. phase:"plan" first (gate G-plan), then phase:"build" after Faeez approves.',
  phases: [
    { title: 'Plan' },
    { title: 'Build' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Close' },
  ],
}

// ---- inputs (from /cadence-deliver) ----
// args = { ticket, brief, workType, subsystems[], phase, sensitive? }
const A = args || {}
const ticket = A.ticket || 'CAD-UNKNOWN'
const brief = A.brief || 'No brief provided.'
const workType = A.workType || 'feature'           // fix | feature | epic | incident | design | strategy | research-spike
const subsystems = Array.isArray(A.subsystems) ? A.subsystems : []
const phase = A.phase || 'plan'

// subsystem tag -> specialist agentType (see docs/AGENT_TEAM.md §1)
const SPECIALIST = {
  'research-search': 'cadence-research-search',
  'retrieval-consolidation': 'cadence-retrieval-consolidation',
  'llm-composer': 'cadence-llm-composer',
  'multi-llm-provider': 'cadence-multi-llm-provider',
  'channels-delivery': 'cadence-channels-delivery',
  'content-format': 'cadence-content-format',
  'self-learning': 'cadence-self-learning',
  'eval-quality': 'cadence-eval-quality',
  'agent-harness': 'cadence-agent-harness',
}
// keep tag + agentType paired so a bad/unknown tag can't misalign labels downstream
const ownerPairs = subsystems
  .map(tag => ({ tag, agentType: SPECIALIST[tag] }))
  .filter(p => p.agentType)

// sensitivity → pull the security gate
const SENSITIVE_SUBSYS = ['channels-delivery', 'agent-harness']
const sensitive = !!A.sensitive || workType === 'epic' ||
  subsystems.some(s => SENSITIVE_SUBSYS.includes(s))

// adversarial reviewer count by work-type (the cost dial)
const REVIEWERS = workType === 'epic' ? 3 : 1

const CONTEXT = `Ticket ${ticket}. Work-type: ${workType}. Subsystems: ${subsystems.join(', ') || 'none'}.
Brief: ${brief}
Obey docs/AGENT_TEAM.md §7 guardrails. Repo /Users/faeez/dev/projects/cadence, app apps/web.`

// ===================== CLOSE (automated, post-SHIP) =====================
// Runs after Faeez ships. Auto-updates every doc + tracker so the next session
// starts clean — NO per-step prompting. Touches docs/trackers only, not product code.
if (phase === 'close') {
  phase('Close')
  log(`Closing ${ticket}: archive plan → regenerate HANDOVER + memory → sync Linear/Notion + decisions index + CHANGELOG → ratchet.`)
  const close = await parallel([
    () => agent(
      `You are the Bookkeeper closing ${ticket} after SHIP. Per .claude/skills/cadence-bookkeeping/SKILL.md: (1) move the Linear CAD ticket to Done; (2) update the Notion Engineering mirror + the docs/decisions index page; (3) append the shipped change to CHANGELOG.md under [Unreleased] (Keep a Changelog categories); (4) archive docs/plans/${ticket}.md to docs/plans/_archive/ with header '> SHIPPED <date> | PR #N | ${ticket}'; (5) refresh ticket-map.json. If a decision changed, confirm a new ADR exists in docs/decisions/. Print URLs + counts. ${CONTEXT}`,
      { agentType: 'cadence-bookkeeper', label: 'close:bookkeep', phase: 'Close' }),
    () => agent(
      `Regenerate HANDOVER.md from current Linear + Notion + git (last commits) per .claude/skills/cadence-handover/SKILL.md, and refresh the cadence-* memory primers (capped, summary-only — never a parallel source of truth). Cite paths. ${CONTEXT}`,
      { agentType: 'cadence-bookkeeper', label: 'close:handover', phase: 'Close' }),
  ])
  const ratchet = await agent(
    `Ratchet / harness-hardening pass for ${ticket} (Hashimoto "engineer the harness"). Review this cycle's review + verify findings. For each mistake or near-miss, name the HARNESS fix — AGENTS.md, CLAUDE.md, a skill, a hook, or a new ADR — not just a code fix. The harness only tightens. Output a concrete edit list for Faeez to approve. ${CONTEXT}`,
    { agentType: 'cadence-cofounder', label: 'close:ratchet', phase: 'Close' })
  log(`${ticket} CLOSE complete. If gbrain is set up: run /sync-gbrain. Apply the ratchet edits.`)
  return { ticket, phase: 'close', close, ratchet, awaiting: 'apply ratchet edits' }
}

// ===================== PLAN =====================
// Research spikes (parallel, read-only) for tagged subsystems on non-fix work, then the Architect synthesizes.
phase('Plan')
let spikes = []
if (workType !== 'fix' && ownerPairs.length) {
  const raw = await parallel(ownerPairs.map(p => () =>
    agent(`Run a /deep-research spike for ${ticket} on your subsystem: state of the art, provider docs/limits, trade-offs, current metric + golden set. Be evidence-first; cite sources. ${CONTEXT}`,
      { agentType: p.agentType, label: `spike:${p.tag}`, phase: 'Plan' })
      .then(text => ({ tag: p.tag, text }))
  ))
  spikes = raw.filter(r => r && r.text)
}

const plan = await agent(
  `You are the Architect. Produce docs/plans/${ticket}.md: problem, researched approach (cite the spikes), file-level change list, TARGET EVAL METRIC + golden set (the G-eval basis), risks, and which gates apply. ${CONTEXT}
${spikes.length ? `\nResearch spikes:\n${spikes.map(s => `--- ${s.tag} ---\n${s.text}`).join('\n')}` : ''}`,
  { agentType: 'cadence-architect', label: 'plan', phase: 'Plan' }
)

if (phase !== 'build') {
  log(`Plan written for ${ticket}. GATE G-plan: Faeez must approve docs/plans/${ticket}.md before BUILD. Re-run /cadence-deliver with phase:"build" to proceed.`)
  return { ticket, phase: 'plan', planSummary: plan, awaiting: 'G-plan approval' }
}

// ===================== BUILD =====================
// Mutating stage — runs SEQUENTIALLY to avoid parallel edits to the same tree.
phase('Build')
log(`Building ${ticket} (G-plan approved). Builder scaffolds, then ${ownerPairs.length} specialist(s) implement sequentially.`)

const buildLog = []
buildLog.push(await agent(
  `You are the Builder. From the approved docs/plans/${ticket}.md, do the vertical-slice plumbing (migration via apply-NNNN.mjs, tRPC under server/trpc, UI shell, test scaffolding) per .claude/skills/cadence-build-wave/SKILL.md. One commit per stage, push after each. Leave the deep subsystem logic to the specialists. ${CONTEXT}`,
  { agentType: 'cadence-builder', label: 'build:plumbing', phase: 'Build' }
))
for (const p of ownerPairs) {
  buildLog.push(await agent(
    `Implement your subsystem's deep logic for ${ticket} on the branch the Builder created, conforming to existing interfaces. Extend your golden set. Commit one logical change at a time, push after each. ${CONTEXT}`,
    { agentType: p.agentType, label: `build:${p.tag}`, phase: 'Build' }
  ))
}

// ===================== REVIEW =====================
// Read-only — safe to parallelize. Adversarial reviewers + eval verdict + (security if sensitive).
phase('Review')
const reviewThunks = []
for (let i = 0; i < REVIEWERS; i++) {
  reviewThunks.push(() => agent(
    `Adversarially review the ${ticket} branch diff for correctness, reuse, and the §7 Cadence guardrails. Try to REFUTE correctness; default to a finding only if you can show it. Tag P0/P1/P2 with file:line + fix. ${CONTEXT}`,
    { agentType: 'cadence-reviewer', label: `review:${i + 1}`, phase: 'Review' }))
}
if (ownerPairs.length) {
  reviewThunks.push(() => agent(
    `Run /cadence-eval for the ${ticket} subsystem(s): ${subsystems.join(', ')}. Print metric, baseline, new value, threshold, and the move-or-hold verdict (G-eval). ${CONTEXT}`,
    { agentType: 'cadence-eval-quality', label: 'review:eval', phase: 'Review' }))
}
if (sensitive) {
  reviewThunks.push(() => agent(
    `Security-gate the ${ticket} diff (auth/billing/secrets/RLS/webhook/BYO/admin). Verdict BLOCK or CLEAR with findings. ${CONTEXT}`,
    { agentType: 'cadence-security', label: 'review:security', phase: 'Review' }))
}
const reviews = (await parallel(reviewThunks)).filter(Boolean)

// ===================== VERIFY =====================
phase('Verify')
const verify = await agent(
  `You are QA. Verify ${ticket} at runtime against the acceptance criteria in docs/plans/${ticket}.md (use /verify, /qa, /browse on the preview). For composer/Pro changes confirm the eval gate + dogfood bar. Report pass/fail per criterion with evidence. ${CONTEXT}`,
  { agentType: 'cadence-qa', label: 'verify', phase: 'Verify' }
)

log(`${ticket} reached VERIFY. GATE: SHIP + CLOSE are human-gated — Faeez decides ship (/ship or /land-and-deploy), then cadence-bookkeeper closes out.`)
return {
  ticket,
  phase: 'build',
  workType,
  subsystems,
  build: buildLog,
  reviews,
  verify,
  awaiting: 'human SHIP decision',
}
