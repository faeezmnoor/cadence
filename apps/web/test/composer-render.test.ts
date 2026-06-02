import { describe, it, expect } from "vitest";
import { renderBriefMarkdown } from "@/server/ai/composer/render";
import type { BriefJson } from "@/server/ai/composer/schema";

const SAMPLE: BriefJson = {
  schema_version: 1,
  header: {
    date: "2 Jun 2026",
    cadence_label: "Daily",
    industry: "Palm oil & feedstock",
    personalization_summary: "KL plantation trader",
  },
  tldr: "CPO holds RM3,920; quota lifted [1].",
  sections: [
    {
      heading: "Prices",
      bullets: [
        { text: "CPO Aug RM3,920 ▼0.4%", citation_markers: [] },
        { text: "Soyoil 47.2¢/lb ▲1.1%", citation_markers: [2] },
      ],
    },
    {
      heading: "What moved",
      bullets: [{ text: "MPOB raised quota [1]", citation_markers: [1] }],
    },
    {
      heading: "Watch this week",
      bullets: [{ text: "Felda earnings Thu", citation_markers: [] }],
    },
  ],
  why_it_matters: "Your CPO short gets a near-term tailwind.",
  feedback_cta: 'Reply 👍 / 👎 — or "tune: <what to change>"',
  sources: [
    { marker: 1, title: "MPOB", url: "https://mpob.gov.my/q" },
    { marker: 2, title: "Reuters", url: "https://reuters.com/x" },
  ],
};

describe("renderBriefMarkdown", () => {
  it("produces a deterministic output for the same input", () => {
    expect(renderBriefMarkdown(SAMPLE)).toBe(renderBriefMarkdown(SAMPLE));
  });

  it("includes header date, cadence, industry, personalization", () => {
    const md = renderBriefMarkdown(SAMPLE);
    expect(md).toMatch(/Cadence.*Daily.*2 Jun 2026/);
    expect(md).toMatch(/Palm oil & feedstock/);
    expect(md).toMatch(/Tuned for: KL plantation trader/);
  });

  it("renders TL;DR, all section headings, why_it_matters, feedback_cta, sources", () => {
    const md = renderBriefMarkdown(SAMPLE);
    expect(md).toMatch(/\*TL;DR\* — CPO holds/);
    expect(md).toMatch(/\*Prices\*/);
    expect(md).toMatch(/\*What moved\*/);
    expect(md).toMatch(/\*Watch this week\*/);
    expect(md).toMatch(/\*Why this matters to you\*/);
    expect(md).toMatch(/Reply 👍/);
    expect(md).toMatch(/\*Sources\*/);
    expect(md).toMatch(/\[1\] MPOB — https:\/\/mpob/);
    expect(md).toMatch(/\[2\] Reuters — https:\/\/reuters/);
  });

  it("never identifies output as a Telegram message", () => {
    const md = renderBriefMarkdown(SAMPLE);
    expect(md).not.toMatch(/Telegram/i);
  });

  it("appends citation markers only when not already inline (no double-marking)", () => {
    const md = renderBriefMarkdown(SAMPLE);
    // Bullet with inline [1] should appear exactly once with [1].
    const moved = md.split("\n").find((l) => l.includes("MPOB raised quota")) ?? "";
    expect((moved.match(/\[1\]/g) ?? []).length).toBe(1);
    // Bullet "Soyoil…" has no inline marker but has citation_markers [2], so [2] is appended.
    const soyoil = md.split("\n").find((l) => l.includes("Soyoil")) ?? "";
    expect(soyoil).toMatch(/\[2\]/);
  });

  it("respects 3-5 section count after render", () => {
    const md = renderBriefMarkdown(SAMPLE);
    // Section headings are wrapped in *…* on their own line. Count them.
    const sectionLines = md
      .split("\n")
      .filter((l) => /^\*[^*]+\*$/.test(l) && !/^\*(TL;DR|Sources|Why)/.test(l));
    // *Prices*, *What moved*, *Watch this week*, *Why this matters to you* —
    // we filter out "Why" and Sources/TL;DR explicitly.
    expect(sectionLines.length).toBeGreaterThanOrEqual(3);
    expect(sectionLines.length).toBeLessThanOrEqual(5);
  });
});
