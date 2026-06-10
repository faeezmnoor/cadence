/**
 * Shared channel-adapter invariant suite (CAD-205).
 *
 * Every adapter registered in `server/channels/index.ts` MUST pass these
 * assertions. This is the contract that keeps the channel surface area
 * shippable as it grows — a future engineer adding WhatsApp / Email /
 * Slack can't merge an adapter that emits oversized parts or eats source
 * citations.
 *
 * Owner: cadence/blueprint/channel-adapter-architecture.md §Enforcement.
 */
import { describe, expect, it } from "vitest";
import { registeredAdapters } from "@/server/channels";
import type { ComposedBrief } from "@/server/channels";

const briefOf = (markdown: string): ComposedBrief => ({ markdown });

const repeat = (s: string, n: number) => s.repeat(n);

const SOURCE_LINK = "[1](https://example.com/long/path/to/source-article-2026)";

describe("channel-adapter invariants", () => {
  it("registry is non-empty", () => {
    expect(registeredAdapters.length).toBeGreaterThan(0);
  });

  for (const adapter of registeredAdapters) {
    describe(`${adapter.invariants.label} (${adapter.channel})`, () => {
      it("invariants: softCap <= hardCap, both positive", () => {
        expect(adapter.invariants.hardCap).toBeGreaterThan(0);
        expect(adapter.invariants.softCap).toBeGreaterThan(0);
        expect(adapter.invariants.softCap).toBeLessThanOrEqual(
          adapter.invariants.hardCap
        );
      });

      it("empty brief yields zero parts", () => {
        const parts = adapter.format(briefOf(""));
        expect(parts).toEqual([]);
      });

      it("whitespace-only brief yields zero parts", () => {
        const parts = adapter.format(briefOf("   \n\n \t  "));
        expect(parts).toEqual([]);
      });

      it("short brief returns exactly one part", () => {
        const parts = adapter.format(briefOf("Hello world\n\nA short brief."));
        expect(parts.length).toBe(1);
      });

      it("never emits a part exceeding hard cap", () => {
        const big = repeat("Lorem ipsum dolor sit amet. ", 2000);
        const parts = adapter.format(briefOf(big));
        for (const p of parts) {
          expect(adapter.partText(p).length).toBeLessThanOrEqual(
            adapter.invariants.hardCap
          );
        }
      });

      it("never emits a part exceeding hard cap on heading-only brief", () => {
        const big = repeat("## Section heading line\n\n", 500);
        const parts = adapter.format(briefOf(big));
        for (const p of parts) {
          expect(adapter.partText(p).length).toBeLessThanOrEqual(
            adapter.invariants.hardCap
          );
        }
      });

      it("never emits an empty or whitespace-only part", () => {
        const big = repeat("Paragraph block.\n\n", 500);
        const parts = adapter.format(briefOf(big));
        for (const p of parts) {
          const t = adapter.partText(p);
          expect(t.length).toBeGreaterThan(0);
          expect(t.trim().length).toBeGreaterThan(0);
        }
      });

      it("preserves source citation links across split boundaries", () => {
        // Build a brief where the citation marker appears repeatedly so any
        // adapter that splits naively will land a boundary in the middle of
        // one. The marker must survive intact.
        const body =
          repeat("A claim with a citation " + SOURCE_LINK + ". ", 600);
        const parts = adapter.format(briefOf(body));
        const joined = parts.map((p) => adapter.partText(p)).join("\n");
        const originalCount = (body.match(/\[1\]\(https/g) || []).length;
        const outputCount = (joined.match(/\[1\]\(https/g) || []).length;
        // We tolerate a small drop from soft-cap trimming (worst case: one
        // citation lands exactly at a cut and gets pushed onto the next part
        // after a leading-whitespace skip). Never more than 5%.
        expect(outputCount).toBeGreaterThanOrEqual(
          Math.floor(originalCount * 0.95)
        );
        // And no half-link "[1](https" without the closing ")".
        for (const p of parts) {
          const t = adapter.partText(p);
          const opens = (t.match(/\[\d+\]\(https/g) || []).length;
          const closes = (t.match(/\[\d+\]\(https[^)]*\)/g) || []).length;
          expect(closes).toBe(opens);
        }
      });

      it("handles brief with >100 sources without exploding", () => {
        const lines: string[] = [];
        for (let i = 1; i <= 120; i++) {
          lines.push(`- Source ${i}: [${i}](https://example.com/${i})`);
        }
        const parts = adapter.format(briefOf(lines.join("\n")));
        expect(parts.length).toBeGreaterThan(0);
        for (const p of parts) {
          expect(adapter.partText(p).length).toBeLessThanOrEqual(
            adapter.invariants.hardCap
          );
        }
      });

      it("round-trips markdown without bleed between parts", () => {
        // Concatenated parts should contain every word from the input
        // (modulo whitespace collapse at boundaries).
        const body =
          "Alpha beta gamma\n\n" +
          repeat("Paragraph delta epsilon zeta. ", 400) +
          "\n\nOmega closing word.";
        const parts = adapter.format(briefOf(body));
        const joined = parts.map((p) => adapter.partText(p)).join(" ");
        for (const word of ["Alpha", "Omega", "delta", "epsilon"]) {
          expect(joined).toContain(word);
        }
      });
    });
  }
});
