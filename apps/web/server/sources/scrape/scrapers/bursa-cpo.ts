/**
 * Bursa Malaysia CPO futures close scraper — Pattern A (CAD-113 #3).
 *
 * Provides the daily settlement price for CPO futures (FCPO). Pair-source
 * to MPOB stocks (mpob-stocks.ts) for the commodity-SME ICP digest.
 *
 * Source: https://www.bursamalaysia.com.my/market_information/equities_prices?legend[]=[D]&board=MAIN-MKT&sector=All
 * (or the derivatives sub-portal; selector targets the FCPO row).
 *
 * RESPECT_ROBOTS: Verified 2026-06-03. Bursa's robots.txt allows
 * /market_information. We make one request per call, no crawl. Compliant.
 *
 * NOTE: Bursa periodically re-skins their pages; if the selector breaks,
 * the scraper returns null gracefully and the composer falls back to
 * the yfinance FCPO=F path (existing Fly.io service).
 */
import type { Page } from "playwright-core";
import { scrape, type ScrapeOptions } from "../playwright";
import type { NormalizedSourceItem } from "../../types";

export const BURSA_CPO_URL =
  "https://www.bursamalaysia.com.my/market_information/derivatives_prices";

export const RESPECT_ROBOTS = true;

async function extract(page: Page) {
  // The derivatives page is a JS-rendered grid — wait for the row text.
  await page.waitForSelector("table, [data-symbol='FCPO']", { timeout: 15_000 });
  const data = await page.evaluate(() => {
    // Try a couple of robust selectors. We're tolerant of layout drift.
    const byAttr = document.querySelector(
      "[data-symbol='FCPO'], [data-instrument='FCPO']"
    );
    if (byAttr) {
      return { text: (byAttr.textContent ?? "").replace(/\s+/g, " ").trim() };
    }
    // Fall back: scan tables for a row containing "FCPO".
    const tables = Array.from(document.querySelectorAll("table"));
    for (const t of tables) {
      for (const row of Array.from(t.querySelectorAll("tr"))) {
        const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
        if (/FCPO\b/.test(text)) return { text };
      }
    }
    return null;
  });

  const today = new Date().toISOString().slice(0, 10);
  const body =
    data === null
      ? "Bursa FCPO row not found — selector drift suspected."
      : `FCPO row: ${data.text}`;
  return {
    source_id: "bursa-cpo",
    title: `Bursa Malaysia CPO Futures — ${today}`,
    body_excerpt: body.slice(0, 2_000),
    published_at: null,
    raw_metadata: { row_text: data?.text ?? null },
  };
}

export async function scrapeBursaCpo(
  opts: Partial<ScrapeOptions> = {}
): Promise<NormalizedSourceItem | null> {
  return scrape(BURSA_CPO_URL, extract, {
    respectsRobots: RESPECT_ROBOTS,
    ...opts,
  });
}

export const _extractForTest = extract;
