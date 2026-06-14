/**
 * CAD-101 — Centralized feature-flag helpers.
 *
 * Locks the truth table for isProTierAlpha() so a future refactor
 * (env → edge config → DB) can't silently change the contract.
 */
import { describe, it, expect } from "vitest";
import { isManageMode, isProTierAlpha } from "@/lib/feature-flags";
import { isProTierAlphaEnabled } from "@/server/ai/providers";

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

describe("manage mode — isManageMode (plan §7.2, exec RC5)", () => {
  it("defaults OFF when unset (kill switch fails closed)", () => {
    withEnv("MANAGE_MODE", undefined, () => {
      expect(isManageMode()).toBe(false);
    });
  });

  it("mirrors the isProTierAlpha truth table exactly", () => {
    for (const v of ["1", "true"]) {
      withEnv("MANAGE_MODE", v, () => {
        expect(isManageMode()).toBe(true);
      });
    }
    for (const v of ["false", "0", "FALSE", "", "True", "yes"]) {
      withEnv("MANAGE_MODE", v, () => {
        expect(isManageMode()).toBe(false);
      });
    }
  });
});

describe("CAD-101 — isProTierAlpha", () => {
  it("returns false when unset", () => {
    withEnv("PRO_TIER_ALPHA", undefined, () => {
      expect(isProTierAlpha()).toBe(false);
    });
  });

  it("returns true for '1'", () => {
    withEnv("PRO_TIER_ALPHA", "1", () => {
      expect(isProTierAlpha()).toBe(true);
    });
  });

  it("returns true for 'true'", () => {
    withEnv("PRO_TIER_ALPHA", "true", () => {
      expect(isProTierAlpha()).toBe(true);
    });
  });

  it("returns false for 'false', '0', 'FALSE', '' (anything else)", () => {
    for (const v of ["false", "0", "FALSE", "", "True", "yes"]) {
      withEnv("PRO_TIER_ALPHA", v, () => {
        expect(isProTierAlpha()).toBe(false);
      });
    }
  });

  it("legacy isProTierAlphaEnabled() delegates to isProTierAlpha()", () => {
    withEnv("PRO_TIER_ALPHA", "1", () => {
      expect(isProTierAlphaEnabled()).toBe(isProTierAlpha());
    });
    withEnv("PRO_TIER_ALPHA", undefined, () => {
      expect(isProTierAlphaEnabled()).toBe(isProTierAlpha());
    });
  });
});

describe("CAD-101 — digest/run.ts alpha-flag safety net", () => {
  // Source-grep tests, same pattern as pro-tier-spec-tier.test.ts.
  // We can't easily exercise runDigestPipeline without a DB mock harness;
  // locking the structural invariants in source is the cheap, durable check.
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const src = readFileSync(
    join(__dirname, "..", "server/digest/run.ts"),
    "utf8"
  );

  it("downgrades advanced→default when alpha flag is off (CAD-222: both advanced stacks)", () => {
    expect(src).toMatch(
      /requestedAdvanced && !isProTierAlphaEnabled\(\)/
    );
    // requestedAdvanced must come from the shared registry helper so a
    // future stack can't dodge the gate.
    expect(src).toMatch(/isAdvancedStack\(requestedTier\)/);
  });

  it("stamps alpha_flag_off as the downgrade reason", () => {
    expect(src).toMatch(/downgradeReason = "alpha_flag_off"/);
  });

  it("logs a warning before downgrading", () => {
    expect(src).toMatch(/PRO_TIER_ALPHA is off — downgrading to default/);
  });
});
