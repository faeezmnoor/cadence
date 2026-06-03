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
