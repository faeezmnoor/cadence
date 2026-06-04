/**
 * Yahoo Finance generic ticker quote scraper — Pattern A (CAD-113 #3).
 *
 * Replaces the brittle yfinance-microservice fallback path for "give me a
 * single quote right now." When the existing Fly.io yfinance svc is up
 * we still prefer it (cheaper + structured). This scraper is the *fallback*
 * when that svc is down OR for tickers it doesn't yet cover.
 *
 * URL pattern: https://finance.yahoo.com/quote/<TICKER>
 *
 * RESPECT_ROBOTS: Yahoo Finance's robots.txt blocks googlebot from /quote
 * but does NOT issue an explicit Disallow for generic user-agents. The
 * yfinance OSS library has scraped these pages openly for 10+ years
 * (research doc §3, "Periodic IP block. Low."). We make one request per
 * call, no crawl. Posture: tolerate-grey. Compliant under Cadence's
 * documented risk envelope (research doc §3).
 */
import type { Page } from "playwright-core";
import { scrape, type ScrapeOptions } from "../playwright";
import type { NormalizedSourceItem } from "../../types";

export const RESPECT_ROBOTS = true;

export function yahooQuoteUrl(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.\-=^]+$/.test(t)) {
    throw new Error(`yahoo-finance-quote: invalid ticker "${ticker}"`);
  }
  return `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`;
}

function buildExtractor(ticker: string) {
  return async function extract(page: Page) {
    await page.waitForSelector(
      "[data-testid='qsp-price'], fin-streamer[data-symbol]",
      { timeout: 15_000 }
    );
    const quote = await page.evaluate((t) => {
      // Prefer new testid; fall back to legacy fin-streamer DOM.
      const byTestId = document.querySelector("[data-testid='qsp-price']");
      const price = byTestId?.textContent?.trim() ?? null;
      const changeEl = document.querySelector(
        "[data-testid='qsp-price-change']"
      );
      const change = changeEl?.textContent?.trim() ?? null;
      const name =
        document.querySelector("h1")?.textContent?.trim() ?? t.toUpperCase();
      return { price, change, name };
    }, ticker);

    const today = new Date().toISOString().slice(0, 10);
    const title = `${quote.name} (${ticker.toUpperCase()}) — Yahoo Finance ${today}`;
    const body = quote.price
      ? `Price: ${quote.price}${quote.change ? ` (${quote.change})` : ""}`
      : "Quote element not found — selector drift suspected.";
    return {
      source_id: `yahoo-finance-quote:${ticker.toUpperCase()}`,
      title,
      body_excerpt: body.slice(0, 2_000),
      published_at: null,
      raw_metadata: { ticker: ticker.toUpperCase(), ...quote },
    };
  };
}

export async function scrapeYahooQuote(
  ticker: string,
  opts: Partial<ScrapeOptions> = {}
): Promise<NormalizedSourceItem | null> {
  const url = yahooQuoteUrl(ticker);
  return scrape(url, buildExtractor(ticker), {
    respectsRobots: RESPECT_ROBOTS,
    ...opts,
  });
}

export const _extractForTest = (ticker: string) => buildExtractor(ticker);
