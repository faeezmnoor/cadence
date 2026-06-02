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
