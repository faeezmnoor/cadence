/**
 * Brief manage mode — route-guard matrix (plan §4.2 / §6) as a pure-function
 * test against resolveThreadGate + deriveThreadMode (extracted per the repo
 * testing philosophy; the route consumes these verbatim).
 *
 * Locked rows:
 *   - setup-active → ok/setup
 *   - archived/completed thread → not_active
 *   - manage-active (live spec) → ok/manage
 *   - manage thread + archived spec → brief_archived
 *   - manage thread + MISSING spec row → brief_archived (fail closed)
 *   - flag OFF + spec-bound thread → flag_off_spec_bound REGARDLESS of
 *     status (exec RC5 / ACX.7 — the kill switch fails closed; a spec-bound
 *     thread must never reach the setup prompt + registry)
 *
 * Cross-user leakage is handled upstream: the route 404s on the ownership-
 * filtered thread select, and the spec select is ownership-filtered too, so
 * an unowned spec reads as "missing" here → brief_archived.
 */
import { describe, expect, it } from "vitest";
import {
  deriveThreadMode,
  resolveThreadGate,
} from "@/server/chat/thread-gate";

const SPEC = "11111111-1111-1111-1111-111111111111";

describe("deriveThreadMode", () => {
  it("derives manage from a spec binding, setup otherwise", () => {
    expect(deriveThreadMode(SPEC)).toBe("manage");
    expect(deriveThreadMode(null)).toBe("setup");
    expect(deriveThreadMode(undefined)).toBe("setup");
  });
});

describe("resolveThreadGate — flag ON", () => {
  it("setup-active → ok/setup", () => {
    expect(
      resolveThreadGate({
        manageMode: true,
        thread: { status: "active", specId: null },
      })
    ).toEqual({ ok: true, mode: "setup" });
  });

  it("manage-active with a live spec → ok/manage", () => {
    for (const status of ["active", "paused"]) {
      expect(
        resolveThreadGate({
          manageMode: true,
          thread: { status: "active", specId: SPEC },
          spec: { status },
        })
      ).toEqual({ ok: true, mode: "manage" });
    }
  });

  it("non-active thread → not_active (archived, completed)", () => {
    for (const status of ["archived", "completed"]) {
      expect(
        resolveThreadGate({
          manageMode: true,
          thread: { status, specId: null },
        })
      ).toEqual({ ok: false, reason: "not_active" });
    }
  });

  it("manage thread with archived spec → brief_archived (AC8.1)", () => {
    expect(
      resolveThreadGate({
        manageMode: true,
        thread: { status: "active", specId: SPEC },
        spec: { status: "archived" },
      })
    ).toEqual({ ok: false, reason: "brief_archived" });
  });

  it("manage thread with MISSING spec row fails closed → brief_archived", () => {
    for (const spec of [null, undefined]) {
      expect(
        resolveThreadGate({
          manageMode: true,
          thread: { status: "active", specId: SPEC },
          spec,
        })
      ).toEqual({ ok: false, reason: "brief_archived" });
    }
  });

  it("non-active manage thread → not_active wins over spec state", () => {
    expect(
      resolveThreadGate({
        manageMode: true,
        thread: { status: "completed", specId: SPEC },
        spec: { status: "active" },
      })
    ).toEqual({ ok: false, reason: "not_active" });
  });
});

describe("resolveThreadGate — flag OFF (exec RC5 fail-closed)", () => {
  it("spec-bound ACTIVE thread → flag_off_spec_bound (the locked matrix row)", () => {
    expect(
      resolveThreadGate({
        manageMode: false,
        thread: { status: "active", specId: SPEC },
        spec: { status: "active" },
      })
    ).toEqual({ ok: false, reason: "flag_off_spec_bound" });
  });

  it("spec-bound thread refused REGARDLESS of status, even without a spec read", () => {
    for (const status of ["active", "completed", "archived"]) {
      expect(
        resolveThreadGate({
          manageMode: false,
          thread: { status, specId: SPEC },
          // Route skips the spec load entirely under flag-off.
          spec: undefined,
        })
      ).toEqual({ ok: false, reason: "flag_off_spec_bound" });
    }
  });

  it("unbound threads behave exactly like legacy", () => {
    expect(
      resolveThreadGate({
        manageMode: false,
        thread: { status: "active", specId: null },
      })
    ).toEqual({ ok: true, mode: "setup" });
    expect(
      resolveThreadGate({
        manageMode: false,
        thread: { status: "completed", specId: null },
      })
    ).toEqual({ ok: false, reason: "not_active" });
  });
});
