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

// Brief-creation revamp PR 1: the turn-0 starters moved out of
// chat-client.tsx into components/chat/starter-cards.tsx (TemplateCard /
// StarterCards). The single-editable-file + turn-0-only invariants still
// hold — they're just pinned against the new module.
const starterCardsPath = fileURLToPath(
  new URL("../components/chat/starter-cards.tsx", import.meta.url)
);
const starterCardsSource = readFileSync(starterCardsPath, "utf8");

describe("chat starter chips (Designer #3 + Ticket 1)", () => {
  it("sources cards from the templates library (single editable file)", () => {
    expect(starterCardsSource).toMatch(
      /import\s*\{[\s\S]*?STARTER_TEMPLATES[\s\S]*?\}\s*from\s*"@\/lib\/digest-spec\/templates"/
    );
    expect(starterCardsSource).toMatch(/STARTER_TEMPLATES\.map\(/);
    // chat-client renders the shared StarterCards component, not its own copy.
    expect(source).toMatch(/import\s*\{\s*StarterCards\s*\}\s*from\s*"\.\/starter-cards"/);
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

  it("card tap auto-submits the exampleQuery with template provenance", () => {
    // Brief-creation revamp PR 1 deliberately replaced autofill-and-edit
    // with informed-consent auto-submit (the card IS the preview). The
    // tap must ride templateId/templateSource so the server can stamp
    // chat_threads.template_id (migration 0026).
    expect(starterCardsSource).toMatch(/data-testid="template-card"/);
    expect(starterCardsSource).toMatch(/onClick=\{\(\)\s*=>\s*onSelect\(template\)\}/);
    expect(source).toMatch(/content:\s*tpl\.exampleQuery/);
    // PR 3 parameterized the source ("starter_card" | "gallery" |
    // "deep_link") — assert the default + the body wiring.
    expect(source).toMatch(/=\s*"starter_card"/);
    expect(source).toMatch(/templateSource:\s*source/);
  });

  it("welcome bubble copy reflects channel-agnostic positioning", () => {
    const welcomeBlock = source.match(
      /data-testid="chat-welcome"[\s\S]*?<StarterCards/
    );
    expect(welcomeBlock).not.toBeNull();
    const text = welcomeBlock![0].toLowerCase();
    expect(text).not.toContain("telegram");
    expect(text).not.toContain("whatsapp");
    // COPY_GUIDE §6: the researcher speaks as "I" in chat — third-person
    // "Cadence" is banned mid-surface, so the bubble introduces the value
    // ("I research…"), not the brand name.
    expect(text).toContain("i research");
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
