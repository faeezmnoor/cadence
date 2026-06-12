/**
 * CAD-101 — Centralized feature-flag helpers.
 *
 * Why this exists: PRO_TIER_ALPHA was being read via `process.env`
 * directly from three places (providers/index.ts, /spec page, digest
 * pipeline). One canonical helper means we can swap the source (env →
 * Vercel edge config → DB) later without grepping for the env var name.
 *
 * Add new flag helpers here. Keep them cheap (sync env reads) so they
 * stay safe to call inside hot paths like digest dispatch.
 */

/**
 * Pro tier alpha rollout flag.
 *
 * Accepts "1" or "true" (case-sensitive) as opt-in. Anything else —
 * including unset, "", "0", "false", "FALSE" — is treated as off.
 *
 * Used by:
 *   - getProviders("pro"): falls back to default bundle when off.
 *   - /spec UI: hides the per-spec tier toggle when off.
 *   - digest/run.ts safety net (CAD-101): downgrades any persisted
 *     spec.tier="pro" to "default" before composing when off, so an
 *     operator flipping the flag back to off can't strand a cohort
 *     on Pro accidentally.
 */
export function isProTierAlpha(): boolean {
  const v = process.env.PRO_TIER_ALPHA;
  return v === "1" || v === "true";
}

/**
 * Brief manage mode rollout flag (manage-mode plan §7.2, exec RC5).
 *
 * Accepts "1" or "true" (case-sensitive) as opt-in — same truth table as
 * isProTierAlpha. Anything else — including unset, "", "0", "false" — is off.
 *
 * This is the primary kill switch and it FAILS CLOSED for spec-bound
 * threads: with the flag off,
 *   - /api/chat 409s ANY thread with spec_id != null regardless of status
 *     (a spec-bound thread must never reach the setup prompt + registry,
 *     whose confirm_and_save → saveSpecForUser can archive-and-replace the
 *     user's live brief at cap),
 *   - /chat resolution skips spec-bound threads entirely,
 *   - ?brief=<id> redirects to /briefs,
 *   - onFinish writes the legacy status='completed' transition.
 *
 * One canonical read site, mirroring isProTierAlpha — never read
 * process.env.MANAGE_MODE directly.
 */
export function isManageMode(): boolean {
  const v = process.env.MANAGE_MODE;
  return v === "1" || v === "true";
}
