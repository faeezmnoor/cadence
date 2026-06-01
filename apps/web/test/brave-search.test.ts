import { describe, it, expect } from "vitest";
import { BraveKeyMissingError, isBraveConfigured } from "@/server/connectors/brave-search";

describe("brave-search connector", () => {
  it("isBraveConfigured returns false when key is unset", () => {
    const prev = process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
    try {
      expect(isBraveConfigured()).toBe(false);
    } finally {
      if (prev !== undefined) process.env.BRAVE_SEARCH_API_KEY = prev;
    }
  });

  it("BraveKeyMissingError carries CAD-56 pointer", () => {
    const err = new BraveKeyMissingError();
    expect(err.name).toBe("BraveKeyMissingError");
    expect(err.message).toMatch(/CAD-56/);
  });
});
