/**
 * Thread gate + mode derivation for /api/chat (manage-mode plan §4.2).
 *
 * Pure helper — extracted per the repo testing philosophy so the route-guard
 * matrix (§6) is a pure-function test, not a route-handler harness. The
 * route loads the thread (ownership-checked) and, for spec-bound threads,
 * the bound digest_specs row, then asks this function what to do.
 *
 * Ordering is load-bearing (exec RC5):
 *   1. Flag off + spec_id != null → refuse, REGARDLESS of thread status.
 *      A spec-bound thread must never fall through to the setup prompt +
 *      setup registry (confirm_and_save → saveSpecForUser archive-and-replace
 *      at cap). This is the fail-closed kill-switch contract (ACX.7).
 *   2. status !== 'active' → refuse (archived/reset threads, legacy
 *      completed threads the user deep-links).
 *   3. Manage thread whose bound spec is missing or archived → refuse with
 *      the brief_archived envelope (AC8.1; also catches archive-while-
 *      tab-open — the next message gets 409, never a stale success).
 */

export type ThreadMode = "setup" | "manage";

/** Mode is DERIVED from the spec binding, never stored (§4.2). */
export function deriveThreadMode(
  specId: string | null | undefined
): ThreadMode {
  return specId != null ? "manage" : "setup";
}

export interface ThreadGateInput {
  /** isManageMode() at request time. */
  manageMode: boolean;
  thread: { status: string; specId: string | null };
  /**
   * Bound digest_specs row (already ownership-filtered by the caller's
   * query) when thread.specId != null. `null`/`undefined` = missing or
   * unowned — treated as archived (fail closed). Ignored for unbound
   * threads.
   */
  spec?: { status: string } | null;
}

export type ThreadGateResult =
  | { ok: true; mode: ThreadMode }
  | {
      ok: false;
      reason: "flag_off_spec_bound" | "not_active" | "brief_archived";
    };

export function resolveThreadGate(input: ThreadGateInput): ThreadGateResult {
  const { manageMode, thread, spec } = input;

  // Exec RC5: fail closed before anything else — regardless of status.
  if (!manageMode && thread.specId != null) {
    return { ok: false, reason: "flag_off_spec_bound" };
  }

  if (thread.status !== "active") {
    return { ok: false, reason: "not_active" };
  }

  const mode = deriveThreadMode(thread.specId);
  if (mode === "manage") {
    // Missing row (FK SET NULL race, unowned) fails closed the same way
    // an archived spec does — the calm /briefs pointer, never a compose.
    if (!spec || spec.status === "archived") {
      return { ok: false, reason: "brief_archived" };
    }
  }

  return { ok: true, mode };
}
