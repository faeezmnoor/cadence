/**
 * T-507a: Low-balance Telegram footer.
 *
 * Pure module. Given (creditsBalance, cadence frequency, app URL), return
 * either a footer string to append to the final Telegram part, or null.
 *
 * Runway tiers (PRD §5.2):
 *   - ≤7 days runway → soft text nudge.
 *   - ≤3 days runway → urgent nudge (still text-only in T-507a; the inline
 *     "Top up" button is T-507b, Stripe-blocked).
 *   - balance ≤ 0 → final-brief paywall CTA. The 1-brief grace credit
 *     (PRD §6.1) means this fires on the LAST delivered brief before
 *     skip-when-broke kicks in.
 *
 * Trial users (`trialActive=true`) get a separate tier copy: nudges them
 * toward topping up while still on trial credits, so the first paid
 * conversion happens BEFORE the spec pauses.
 *
 * Why text-only in v1:
 *   T-507b adds the inline-keyboard "Top up" button — that requires a
 *   live Stripe Checkout deep-link target, which is Stripe-blocked. The
 *   link to /settings/billing already works today (pack cards render,
 *   "Buy" tooltip says "Available shortly"), so the user can still act.
 */

export type Cadence = "daily" | "weekly" | "monthly";

/**
 * Credits consumed per day under each cadence. Used for runway math.
 *   daily   → 1 credit / day
 *   weekly  → 1/7 credit / day
 *   monthly → 1/30 credit / day
 */
function creditsPerDay(cadence: Cadence): number {
  if (cadence === "daily") return 1;
  if (cadence === "weekly") return 1 / 7;
  return 1 / 30;
}

export function runwayDays(creditsBalance: number, cadence: Cadence): number {
  if (creditsBalance <= 0) return 0;
  return creditsBalance / creditsPerDay(cadence);
}

export type FooterTier = "paywall" | "urgent" | "soft" | "trial_nudge" | "none";

export function pickFooterTier(params: {
  creditsBalance: number;
  cadence: Cadence;
  trialActive: boolean;
}): FooterTier {
  const { creditsBalance, cadence, trialActive } = params;

  // Paywall first — the 1-brief grace means balance==0 IS this delivery,
  // so this brief is the user's last paid-equivalent until they top up.
  if (creditsBalance <= 0) return "paywall";

  const days = runwayDays(creditsBalance, cadence);

  // Trial nudge: while still on trial credits AND not yet at the urgent
  // tier — gently surface the upgrade. Beats "surprise paywall on brief 3".
  if (trialActive && days > 3) return "trial_nudge";

  if (days <= 3) return "urgent";
  if (days <= 7) return "soft";
  return "none";
}

function billingUrl(appUrl: string): string {
  // Defensive trim of trailing slash so we don't emit `//settings/billing`.
  return `${appUrl.replace(/\/$/, "")}/settings/billing`;
}

/**
 * Pretty integer days. We round down so "2.4 days" reads as "2 days left"
 * — under-promise. Floor of 1 to avoid "0 days left" when runway > 0.
 */
function prettyDays(days: number): string {
  const d = Math.max(1, Math.floor(days));
  return d === 1 ? "1 day" : `${d} days`;
}

export function buildLowBalanceFooter(params: {
  creditsBalance: number;
  cadence: Cadence;
  trialActive: boolean;
  appUrl: string;
}): string | null {
  const tier = pickFooterTier(params);
  if (tier === "none") return null;

  const url = billingUrl(params.appUrl);

  if (tier === "paywall") {
    return `\n\n---\n_This was your last brief on your current credits. [Top up to keep them coming](${url})._`;
  }

  if (tier === "urgent") {
    const days = prettyDays(runwayDays(params.creditsBalance, params.cadence));
    return `\n\n---\n_${days} of credits left. [Top up](${url})._`;
  }

  if (tier === "trial_nudge") {
    return `\n\n---\n_You're on trial credits. [Top up early](${url}) to keep your briefs flowing._`;
  }

  // soft
  const days = prettyDays(runwayDays(params.creditsBalance, params.cadence));
  return `\n\n---\n_${days} of credits left. [Top up](${url})._`;
}
