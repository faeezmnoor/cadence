/**
 * Playwright scraper framework — Phase 6a Pattern A (CAD-113 #3).
 *
 * Thin wrapper around playwright-core + @sparticuz/chromium so a Vercel
 * serverless function can spin up headless Chromium on demand. The exact
 * same code path runs locally (uses a system Chromium when CADENCE_USE_LOCAL_CHROMIUM=1).
 *
 * Public surface:
 *   scrape(url, extractor) → NormalizedSourceItem
 *
 * The framework owns:
 *  - Browser lifecycle (launch / context / page / close)
 *  - 30s page-level timeout + single retry
 *  - User-agent rotation (mild stealth)
 *  - Normalization to NormalizedSourceItem
 *  - robots.txt awareness: we BLOCK known-disallowed targets at the
 *    framework level via a per-scraper RESPECT_ROBOTS opt-in (see ./scrapers/*)
 *
 * The framework does NOT own:
 *  - Per-site CSS selectors (those live in scrapers/<source>.ts)
 *  - Aggregation across multiple scrapers (composer's job)
 *
 * NOTE on tests: every test in this repo mocks the Playwright import via
 * an injected `chromium` adapter so we never touch the network or download
 * a browser binary.
 */
import type { Browser, BrowserContext, Page } from "playwright-core";
import { parseNormalizedItem, type NormalizedSourceItem } from "../types";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENTS = [
  // Realistic desktop Chromium UAs. Rotated round-robin per call.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
];
let uaIndex = 0;
function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

/**
 * Minimal adapter surface — lets tests pass a fake "chromium" without
 * importing the real playwright-core module.
 */
export interface ChromiumAdapter {
  launch(opts: {
    args?: string[];
    executablePath?: string;
    headless?: boolean;
  }): Promise<Browser>;
}

/**
 * The signature each scraper implements. Receives a live Playwright Page
 * already navigated to `url`, returns the *unvalidated* shape that the
 * framework will then run through parseNormalizedItem.
 */
export type ScrapeExtractor = (
  page: Page,
  url: string
) => Promise<{
  source_id: string;
  title: string;
  body_excerpt?: string;
  published_at?: Date | null;
  raw_metadata?: Record<string, unknown>;
}>;

export interface ScrapeOptions {
  /** Page-level timeout (ms). Default 30_000. */
  timeoutMs?: number;
  /** Inject a chromium adapter (for tests). Defaults to lazy-loaded chromium-min + playwright-core. */
  chromium?: ChromiumAdapter;
  /**
   * Caller's confirmation that this URL is safe to fetch under our
   * ToS / robots.txt posture. The framework refuses to launch a browser
   * unless this is true — forces every scraper file to make an explicit
   * positive declaration (search code for RESPECT_ROBOTS).
   */
  respectsRobots: boolean;
}

/**
 * Lazy-load the real Playwright stack. Hidden behind a function so
 * test environments that mock `chromium` never trigger the import.
 */
async function defaultChromium(): Promise<ChromiumAdapter> {
  const { chromium } = await import("playwright-core");
  // @sparticuz/chromium is the Vercel-friendly binary. Locally we let
  // Playwright find a system Chrome via PLAYWRIGHT_CHROMIUM_PATH or fall
  // back to bundle. Wrap in a closure so callers get the same surface.
  const sparticuz = await import("@sparticuz/chromium").catch(() => null);
  return {
    async launch(opts) {
      const executablePath =
        opts.executablePath ?? (await sparticuz?.default.executablePath());
      return chromium.launch({
        args: opts.args ?? sparticuz?.default.args ?? [],
        executablePath,
        headless: opts.headless ?? true,
      });
    },
  };
}

/**
 * Scrape one URL, run the extractor, return a NormalizedSourceItem.
 * One retry on transient failures (timeout, navigation error).
 *
 * Returns null when both attempts fail — caller decides how to react
 * (composer should just degrade gracefully).
 */
export async function scrape(
  url: string,
  extractor: ScrapeExtractor,
  opts: ScrapeOptions
): Promise<NormalizedSourceItem | null> {
  if (!opts.respectsRobots) {
    console.warn(
      `[sources/scrape] refusing to launch — scraper for ${url} did not declare RESPECT_ROBOTS`
    );
    return null;
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chromium = opts.chromium ?? (await defaultChromium());

  for (let attempt = 1; attempt <= 2; attempt++) {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
      browser = await chromium.launch({});
      context = await browser.newContext({
        userAgent: nextUserAgent(),
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const extracted = await extractor(page, url);
      const item = parseNormalizedItem(
        {
          source_id: extracted.source_id,
          source_type: "scrape",
          url,
          title: extracted.title,
          body_excerpt: extracted.body_excerpt ?? "",
          published_at: extracted.published_at ?? null,
          raw_metadata: extracted.raw_metadata ?? {},
        },
        `scrape:${extracted.source_id}`
      );
      return item;
    } catch (err) {
      console.warn(
        `[sources/scrape] attempt ${attempt} failed for ${url}:`,
        err instanceof Error ? err.message : String(err)
      );
      if (attempt === 2) return null;
    } finally {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
  }
  return null;
}
