/**
 * Tests for Pattern A Playwright scraper framework + 3 concrete scrapers
 * (CAD-113 Phase 6a Ticket 3).
 *
 * All Playwright IO is mocked — no browser binary, no live network.
 */
import { describe, it, expect, vi } from "vitest";
import { scrape, type ChromiumAdapter } from "@/server/sources/scrape/playwright";
import {
  scrapeMpobStocks,
  MPOB_STOCKS_URL,
} from "@/server/sources/scrape/scrapers/mpob-stocks";
import {
  scrapeBursaCpo,
  BURSA_CPO_URL,
} from "@/server/sources/scrape/scrapers/bursa-cpo";
import {
  scrapeYahooQuote,
  yahooQuoteUrl,
} from "@/server/sources/scrape/scrapers/yahoo-finance-quote";

/**
 * Build a fake chromium adapter whose pages return the given `evaluate`
 * payload (we never run real DOM code in tests — extractors call
 * page.evaluate which we stub here).
 */
function makeFakeChromium(opts: {
  evaluateReturn?: unknown;
  goto?: () => Promise<void>;
  evaluateThrows?: Error;
}): ChromiumAdapter {
  const page = {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    goto: opts.goto ?? (async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => {
      if (opts.evaluateThrows) throw opts.evaluateThrows;
      return opts.evaluateReturn;
    }),
  };
  const context = {
    newPage: async () => page,
    close: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: async () => context,
    close: vi.fn(async () => undefined),
  };
  return {
    launch: async () => browser as unknown as Awaited<ReturnType<ChromiumAdapter["launch"]>>,
  };
}

describe("scrape framework (Pattern A)", () => {
  it("refuses to run without RESPECT_ROBOTS declaration", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chromium = makeFakeChromium({ evaluateReturn: {} });
    const out = await scrape(
      "https://example.com",
      async () => ({ source_id: "x", title: "x" }),
      { respectsRobots: false, chromium }
    );
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns a NormalizedSourceItem on success", async () => {
    const chromium = makeFakeChromium({ evaluateReturn: { ok: true } });
    const out = await scrape(
      "https://example.com/page",
      async () => ({
        source_id: "test",
        title: "hello",
        body_excerpt: "world",
      }),
      { respectsRobots: true, chromium }
    );
    expect(out).not.toBeNull();
    expect(out?.source_type).toBe("scrape");
    expect(out?.source_id).toBe("test");
    expect(out?.title).toBe("hello");
  });

  it("retries once on extractor error, then returns null", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chromium = makeFakeChromium({});
    let calls = 0;
    const out = await scrape(
      "https://example.com",
      async () => {
        calls++;
        throw new Error("boom");
      },
      { respectsRobots: true, chromium }
    );
    expect(out).toBeNull();
    expect(calls).toBe(2);
    warn.mockRestore();
  });

  it("drops malformed extractor output via parseNormalizedItem", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chromium = makeFakeChromium({});
    const out = await scrape(
      "https://example.com",
      async () =>
        ({
          // missing title entirely
          source_id: "x",
        }) as unknown as { source_id: string; title: string },
      { respectsRobots: true, chromium }
    );
    expect(out).toBeNull();
    warn.mockRestore();
  });
});

describe("mpob-stocks scraper", () => {
  it("targets the public MPOB stats portal URL", () => {
    expect(MPOB_STOCKS_URL).toMatch(/bepi\.mpob\.gov\.my/);
  });

  it("produces a NormalizedSourceItem on a successful evaluate", async () => {
    const chromium = makeFakeChromium({
      evaluateReturn: {
        headerCells: ["Month", "Closing Stock (MT)"],
        cells: ["Apr 2026", "1,850,000"],
      },
    });
    const out = await scrapeMpobStocks({ chromium });
    expect(out?.source_id).toBe("mpob-stocks");
    expect(out?.url).toBe(MPOB_STOCKS_URL);
    expect(out?.body_excerpt).toContain("1,850,000");
    expect(out?.raw_metadata).toHaveProperty("headers");
  });
});

describe("bursa-cpo scraper", () => {
  it("targets the Bursa derivatives portal URL", () => {
    expect(BURSA_CPO_URL).toMatch(/bursamalaysia\.com\.my/);
  });

  it("captures the FCPO row text", async () => {
    const chromium = makeFakeChromium({
      evaluateReturn: { text: "FCPO Jun-26 4,210 +35" },
    });
    const out = await scrapeBursaCpo({ chromium });
    expect(out?.source_id).toBe("bursa-cpo");
    expect(out?.body_excerpt).toContain("FCPO Jun-26 4,210");
  });

  it("handles missing FCPO row gracefully (selector drift)", async () => {
    const chromium = makeFakeChromium({ evaluateReturn: null });
    const out = await scrapeBursaCpo({ chromium });
    expect(out?.body_excerpt).toContain("selector drift");
  });
});

describe("yahoo-finance-quote scraper", () => {
  it("builds a valid Yahoo URL for a clean ticker", () => {
    expect(yahooQuoteUrl("aapl")).toBe("https://finance.yahoo.com/quote/AAPL");
    expect(yahooQuoteUrl("FCPO=F")).toBe(
      "https://finance.yahoo.com/quote/FCPO%3DF"
    );
  });

  it("rejects malformed tickers", () => {
    expect(() => yahooQuoteUrl("AAPL; DROP TABLE")).toThrow(/invalid ticker/);
  });

  it("produces a quote NormalizedSourceItem", async () => {
    const chromium = makeFakeChromium({
      evaluateReturn: {
        price: "186.42",
        change: "+1.20 (+0.65%)",
        name: "Apple Inc.",
      },
    });
    const out = await scrapeYahooQuote("AAPL", { chromium });
    expect(out?.source_id).toBe("yahoo-finance-quote:AAPL");
    expect(out?.body_excerpt).toContain("186.42");
    expect(out?.raw_metadata).toMatchObject({ ticker: "AAPL", price: "186.42" });
  });
});
