/**
 * Designer #3 (design-audit-v1 §3) + Ticket 1: /chat turn 0 must show a
 * welcome bubble + a strip of curated template chips. Chips are sourced
 * from apps/web/lib/digest-spec/templates.ts so Faeez can edit one file
 * and redeploy. Once any message exists the welcome state must hide so
 * the T-414 contextual chips can take over.
 *
 * Source-pattern test — matches the existing post-confirm-redirect style
 * because vitest's include pattern is *.test.ts and the chips live inside
 * a "use client" component that would require a full React testing-library
 * setup to render. Pinning the structural invariants here catches silent
 * regressions cheaply.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { DIGEST_TEMPLATES, classifyTopic } from "@/lib/digest-spec/templates";

const chatClientPath = fileURLToPath(
  new URL("../components/chat/chat-client.tsx", import.meta.url)
);
const source = readFileSync(chatClientPath, "utf8");

describe("chat starter chips (Designer #3 + Ticket 1)", () => {
  it("sources chips from the DIGEST_TEMPLATES library (single editable file)", () => {
    expect(source).toMatch(
      /import\s*\{\s*DIGEST_TEMPLATES\s*\}\s*from\s*"@\/lib\/digest-spec\/templates"/
    );
    expect(source).toMatch(/const STARTER_CHIPS = DIGEST_TEMPLATES/);
  });

  it("ships at least 10 curated templates spanning multiple categories", () => {
    expect(DIGEST_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(DIGEST_TEMPLATES.map((t) => t.category));
    expect(categories.size).toBeGreaterThanOrEqual(8);
  });

  it("template labels and example queries respect the no-channel positioning rule", () => {
    for (const tpl of DIGEST_TEMPLATES) {
      const blob = `${tpl.label} ${tpl.exampleQuery}`.toLowerCase();
      expect(blob, `template ${tpl.id}`).not.toContain("telegram");
      expect(blob, `template ${tpl.id}`).not.toContain("whatsapp");
    }
  });

  it("welcome bubble + chips only render when there are zero messages", () => {
    expect(source).toMatch(/const hasMessages = messages\.length > 0/);
    expect(source).toMatch(/\{!hasMessages && \(/);
  });

  it("chip click autofills the input via handleStarterChip (NOT auto-submit)", () => {
    // Per Ticket 1: chips populate the input so the user can edit before
    // sending. This is intentionally different from the T-414 contextual
    // chips, which auto-submit via handleSuggestion -> append().
    expect(source).toMatch(/data-testid="chat-starter-chips"/);
    expect(source).toMatch(
      /onClick=\{\(\)\s*=>\s*handleStarterChip\(tpl\.exampleQuery\)\}/
    );
    expect(source).toMatch(/setInput\(exampleQuery\)/);
  });

  it("welcome bubble copy reflects channel-agnostic positioning", () => {
    const welcomeBlock = source.match(
      /data-testid="chat-welcome"[\s\S]*?<\/div>\s*<\/div>\s*\)\}/
    );
    expect(welcomeBlock).not.toBeNull();
    const text = welcomeBlock![0].toLowerCase();
    expect(text).not.toContain("telegram");
    expect(text).not.toContain("whatsapp");
    expect(text).toContain("cadence");
  });

  it("classifyTopic buckets known keywords and returns null for unknown topics", () => {
    expect(classifyTopic({ topics: ["palm oil prices"] }).templateId).toBe(
      "palm_oil_mpob"
    );
    expect(classifyTopic({ topics: ["Bitcoin recap"] }).templateId).toBe(
      "bitcoin_crypto"
    );
    expect(
      classifyTopic({ topics: ["durian harvest forecast"] }).templateId
    ).toBeNull();
    expect(classifyTopic({ topics: [] }).matched).toBe(false);
  });
});
