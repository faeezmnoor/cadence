/**
 * buildGnewsFeeds — CAD-221 recall pack (dynamic Google News entity feeds).
 *
 * Pure-function tests, no network. Covers: URL encoding + exact-term
 * quoting, MY localisation params, term caps + companies-first ordering,
 * case-insensitive dedupe, length skips, slug stability, and the SSRF
 * posture (every generated URL is https on news.google.com — a public
 * host that passes the rss-ssrf guard patterns).
 */
import { describe, it, expect } from "vitest";
import {
  buildGnewsFeeds,
  gnewsSearchUrl,
  slugifyGnewsTerm,
  MAX_GNEWS_TERMS,
  GNEWS_TOPIC,
} from "@/server/sources/rss/gnews";

describe("gnewsSearchUrl", () => {
  it("quotes the exact term and URL-encodes it (curated bnm-gnews pattern)", () => {
    expect(gnewsSearchUrl("Sime Darby")).toBe(
      "https://news.google.com/rss/search?q=%22Sime+Darby%22&hl=en-MY&gl=MY&ceid=MY:en"
    );
  });

  it("encodes special characters safely", () => {
    const url = gnewsSearchUrl("AT&T Inc");
    expect(url).toContain("%22AT%26T+Inc%22");
    expect(url).not.toContain("&T "); // ampersand must not leak as a param separator
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).searchParams.get("q")).toBe('"AT&T Inc"');
  });

  it("pins MY localisation", () => {
    const u = new URL(gnewsSearchUrl("FGV Holdings"));
    expect(u.searchParams.get("hl")).toBe("en-MY");
    expect(u.searchParams.get("gl")).toBe("MY");
    expect(u.searchParams.get("ceid")).toBe("MY:en");
  });
});

describe("slugifyGnewsTerm", () => {
  it("is stable for the same input", () => {
    expect(slugifyGnewsTerm("Sime Darby Bhd.")).toBe("sime-darby-bhd");
    expect(slugifyGnewsTerm("Sime Darby Bhd.")).toBe(slugifyGnewsTerm("Sime Darby Bhd."));
  });

  it("collapses punctuation/whitespace runs into single hyphens", () => {
    expect(slugifyGnewsTerm("  FGV -- Holdings!  ")).toBe("fgv-holdings");
  });

  it("returns empty string for non-alphanumeric input", () => {
    expect(slugifyGnewsTerm("$$$")).toBe("");
  });
});

describe("buildGnewsFeeds", () => {
  it("returns [] for empty input", () => {
    expect(buildGnewsFeeds({ companies: [], keywords: [] })).toEqual([]);
  });

  it("produces CuratedFeed-shaped entries with gnews ids, labels and topic", () => {
    const [feed] = buildGnewsFeeds({ companies: ["Sime Darby"], keywords: [] });
    expect(feed).toEqual({
      id: "gnews-sime-darby",
      label: "Google News: Sime Darby",
      url: "https://news.google.com/rss/search?q=%22Sime+Darby%22&hl=en-MY&gl=MY&ceid=MY:en",
      topics: [GNEWS_TOPIC],
    });
  });

  it("orders companies before keywords and caps at MAX_GNEWS_TERMS", () => {
    const feeds = buildGnewsFeeds({
      companies: ["Alpha Corp", "Beta Bhd", "Gamma Sdn"],
      keywords: ["palm kernel", "biodiesel mandate"],
    });
    expect(feeds).toHaveLength(MAX_GNEWS_TERMS);
    expect(feeds.map((f) => f.id)).toEqual([
      "gnews-alpha-corp",
      "gnews-beta-bhd",
      "gnews-gamma-sdn",
      "gnews-palm-kernel", // first keyword fills the last slot
    ]);
  });

  it("dedupes terms case-insensitively across companies and keywords", () => {
    const feeds = buildGnewsFeeds({
      companies: ["Sime Darby", "SIME DARBY"],
      keywords: ["sime darby", "biodiesel"],
    });
    expect(feeds.map((f) => f.id)).toEqual(["gnews-sime-darby", "gnews-biodiesel"]);
  });

  it("dedupes slug collisions so two terms cannot mint the same feed id", () => {
    const feeds = buildGnewsFeeds({
      companies: ["Sime-Darby", "Sime Darby!"],
      keywords: [],
    });
    expect(feeds).toHaveLength(1);
    expect(feeds[0].id).toBe("gnews-sime-darby");
  });

  it("skips terms shorter than 3 or longer than 60 chars (after trim)", () => {
    const long = "x".repeat(61);
    const feeds = buildGnewsFeeds({
      companies: ["AI", "  y ", long, "Petronas"],
      keywords: [""],
    });
    expect(feeds.map((f) => f.id)).toEqual(["gnews-petronas"]);
  });

  it("skips terms that slugify to nothing", () => {
    expect(buildGnewsFeeds({ companies: ["$$$$"], keywords: [] })).toEqual([]);
  });

  it("every generated URL is https on news.google.com (SSRF posture)", () => {
    const feeds = buildGnewsFeeds({
      companies: ["Sime Darby", "AT&T Inc"],
      keywords: ["palm kernel", "127.0.0.1"],
    });
    for (const f of feeds) {
      const u = new URL(f.url);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toBe("news.google.com");
    }
  });
});
