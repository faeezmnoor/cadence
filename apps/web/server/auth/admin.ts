/**
 * Admin gate for Cadence.
 *
 * Single-tenant prod, no `users.role` column yet — so admin status is decided
 * by matching the signed-in Supabase user's email against the comma-separated
 * `CADENCE_ADMIN_EMAILS` env var.
 *
 * Set in Vercel:
 *   CADENCE_ADMIN_EMAILS=faeezmnoor@gmail.com
 *
 * If the env var is empty/unset, NO ONE is admin (fail-closed).
 *
 * Why env-var instead of a DB column:
 *   - One-way door avoidance: we don't want to design a roles table before
 *     we have a real multi-user model.
 *   - Operationally simpler: rotating who has /admin access = one env var
 *     change + redeploy.
 *   - Matches the side-project posture: this is for Faeez (and maybe a
 *     trusted second pair of eyes), not a customer-facing admin UI.
 */

function parseAdminEmails(): Set<string> {
  const raw = process.env.CADENCE_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.toLowerCase());
}
