/**
 * Brief-count limit (CAD-212, joint ruling 2026-06-11).
 *
 * Partners are capped at 1 non-archived brief until multi-brief ships
 * for real; the founder account (admin email allowlist — same gate as
 * /admin, see server/auth/admin.ts) is exempt at 2 so multi-brief can
 * be dogfooded without lying to paying users.
 *
 * Single source of truth: the tRPC `briefs.canCreate` procedure, the
 * /briefs server shell, and the chat-save gate in
 * server/ai/config-agent/save-spec.ts all read from here. The UI never
 * hard-codes a limit — it renders whatever `canCreate.max` says.
 */
import { isAdminEmail } from "@/server/auth/admin";

/** Cap for everyone (partners). */
export const MAX_BRIEFS_PER_USER = 1;

/** Founder/admin cap — multi-brief dogfooding only. */
export const MAX_BRIEFS_FOUNDER = 2;

export function maxBriefsForEmail(email: string | null | undefined): number {
  return isAdminEmail(email) ? MAX_BRIEFS_FOUNDER : MAX_BRIEFS_PER_USER;
}

/**
 * Surfaced by the chat agent when a save would have created a second
 * brief and was redirected into an update of the existing one.
 */
export const SINGLE_BRIEF_NOTICE =
  "You have one brief already — multiple briefs are coming soon. " +
  "This chat updates your existing brief instead.";

/** Tooltip on the disabled "+ New brief" affordance. */
export const MULTIPLE_BRIEFS_SOON_TOOLTIP = "Multiple briefs are coming soon.";
