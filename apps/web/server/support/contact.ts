/**
 * Single source of truth for Cadence's support contact surface.
 *
 * Stream D (PM audit #3): every user-facing error/legal/account surface
 * routes to ONE address. Faeez will set up forwarding from cadence.news to
 * his Gmail; until then this constant is the only thing to change when the
 * forwarding flips.
 *
 * We use a `.news` address because Faeez owns the domain (he previously
 * surfaced `faeez@cadence.news` on /terms). `support@` is the friendlier
 * outward face — "faeez@" leaks the founder identity into every error
 * dialog and looks unscalable to Stripe MY KYC reviewers.
 */
export const SUPPORT_EMAIL = "support@cadence.news";

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/**
 * Canonical, user-facing brand URL. Read from NEXT_PUBLIC_APP_URL so the
 * Vercel preview host can flip to `cadence.news` (or wherever GA lands)
 * with zero code changes. The fallback is the current Vercel host — kept
 * so dev / preview environments without env vars still render a working
 * link, but everything user-facing should pull from this constant.
 *
 * Use BRAND_URL for absolute hrefs and BRAND_HOST for display ("cadence.news"
 * without the scheme).
 */
const FALLBACK_BRAND_URL = "https://cadence-web-bice.vercel.app";

/**
 * Resolved at call time so test env mutations to NEXT_PUBLIC_APP_URL are
 * respected. Trailing slashes are stripped so we never produce `//b/<id>`.
 */
export function getBrandUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK_BRAND_URL;
  return raw.replace(/\/+$/, "");
}

export function getBrandHost(): string {
  return getBrandUrl().replace(/^https?:\/\//, "");
}
