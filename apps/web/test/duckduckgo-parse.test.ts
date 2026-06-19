/**
 * CAD-165 — DuckDuckGo HTML parser.
 *
 * The regex SERP parser is the brittle part of the keyless connector, so it
 * gets a pinned test against a representative fixture rather than a live
 * network call (no test in this repo hits the network — apps/web/CLAUDE.md).
 */
import { describe, expect, it } from "vitest";
import { parseDuckDuckGoHtml } from "@/server/connectors/duckduckgo";

// Trimmed but structurally faithful DDG html endpoint output: outbound links
// are wrapped in a /l/?uddg=<encoded> redirect; snippets carry <b> highlights;
// the second result is a duplicate URL (must dedup).
const FIXTURE = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpalm-oil&amp;rut=aaa">Palm oil prices rise</a>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=x">CPO futures climbed 2% on <b>strong</b> demand &amp; tight stocks.</a>
  </div>
</div>
<div class="result results_links web-result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpalm-oil&amp;rut=dup">Palm oil prices rise (dup url)</a>
  <a class="result__snippet">duplicate</a>
</div>
<div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbepi.mpob.gov.my%2Fstats">MPOB monthly stocks</a>
  <a class="result__snippet">Malaysian palm oil board statistics.</a>
</div>
`;

describe("parseDuckDuckGoHtml", () => {
  const results = parseDuckDuckGoHtml(FIXTURE);

  it("decodes the uddg redirect into the real target URL", () => {
    expect(results[0]!.url).toBe("https://example.com/palm-oil");
    expect(results[1]!.url).toBe("https://bepi.mpob.gov.my/stats");
  });

  it("extracts title + strips HTML/entities from the snippet", () => {
    expect(results[0]!.title).toBe("Palm oil prices rise");
    expect(results[0]!.snippet).toBe(
      "CPO futures climbed 2% on strong demand & tight stocks."
    );
  });

  it("dedupes results by URL (first occurrence wins)", () => {
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.url === "https://example.com/palm-oil")).toHaveLength(1);
  });

  it("honors the result limit", () => {
    expect(parseDuckDuckGoHtml(FIXTURE, 1)).toHaveLength(1);
  });

  it("returns [] for empty / non-SERP html", () => {
    expect(parseDuckDuckGoHtml("<html><body>nothing</body></html>")).toEqual([]);
  });
});
