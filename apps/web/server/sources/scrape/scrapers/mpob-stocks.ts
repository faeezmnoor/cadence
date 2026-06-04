/**
 * MPOB monthly palm-oil stock figures scraper — Pattern A (CAD-113 #3).
 *
 * Anchor data point for ICP-1 (palm oil SME) — every CPO trader / refinery /
 * F&B input buyer in MY watches the MPOB monthly release.
 *
 * Source: https://bepi.mpob.gov.my (public stat portal, no login).
 *
 * RESPECT_ROBOTS: Verified 2026-06-03. MPOB publishes these tables as a
 * public stats portal. robots.txt at https://bepi.mpob.gov.my/robots.txt
 * does not disallow /index.php. We hit a single URL once per scrape, no
 * crawling. Compliant.
 */
import type { Page } from "playwright-core";
import { scrape, type ScrapeOptions } from "../playwright";
import type { NormalizedSourceItem } from "../../types";

export const MPOB_STOCKS_URL =
  "https://bepi.mpob.gov.my/index.php/en/statistics/stock";

export const RESPECT_ROBOTS = true;

/**
 * Extracts the closing-stock figure from MPOB's monthly table.
 * Selector intent: first <table> in the main content area, first data row,
 * last numeric cell = closing stock in tonnes.
 */
async function extract(page: Page) {
  // Wait for the stats table to render. MPOB pages are server-rendered
  // so domcontentloaded is usually enough, but we guard explicitly.
  await page.waitForSelector("table", { timeout: 10_000 });
  const data = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return null;
    const headerCells = Array.from(table.querySelectorAll("thead th, tr th"))
      .map((c) => (c.textContent ?? "").trim())
      .filter(Boolean);
    const firstRow = table.querySelector("tbody tr") ?? table.querySelector("tr:nth-of-type(2)");
    if (!firstRow) return null;
    const cells = Array.from(firstRow.querySelectorAll("td")).map((c) =>
      (c.textContent ?? "").trim()
    );
    return { headerCells, cells };
  });

  const today = new Date().toISOString().slice(0, 10);
  const title = `MPOB Palm Oil Stocks — snapshot ${today}`;
  const body =
    data === null
      ? "MPOB stocks table not found on page."
      : `Headers: ${data.headerCells.join(" | ")}\nLatest row: ${data.cells.join(" | ")}`;
  return {
    source_id: "mpob-stocks",
    title,
    body_excerpt: body.slice(0, 2_000),
    published_at: null,
    raw_metadata: { headers: data?.headerCells ?? [], row: data?.cells ?? [] },
  };
}

export async function scrapeMpobStocks(
  opts: Partial<ScrapeOptions> = {}
): Promise<NormalizedSourceItem | null> {
  return scrape(MPOB_STOCKS_URL, extract, {
    respectsRobots: RESPECT_ROBOTS,
    ...opts,
  });
}

// Exported for unit tests.
export const _extractForTest = extract;
