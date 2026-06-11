/**
 * Brief-creation revamp PR 1 — pure invariants for the template catalog
 * (lib/digest-spec/templates.ts). These are the CI-safe half of the
 * template quality gate; the live extraction golden-set + interview eval
 * (LLM-backed, banned from CI by repo testing rules) lives in
 * scripts/eval-template-interview.mjs (PR 2).
 *
 * Every invariant here traces to proposals/brief-creation-flow-proposal.md
 * §3 (card anatomy), §5 (catalog), or the UX-writer banned-terms table.
 */
import { describe, expect, it } from "vitest";
import {
  DIGEST_TEMPLATES,
  STARTER_TEMPLATES,
  VISIBLE_TEMPLATES,
  VISIBLE_CATEGORY_ORDER,
  TEMPLATE_CATEGORY_LABELS,
  classifyTopic,
  formatCadenceHint,
  isKnownTemplateId,
} from "@/lib/digest-spec/templates";
import { digestSpecDraftSchema } from "@/lib/digest-spec/schema";
import { detectMultiTopic } from "@/lib/chat/multi-topic";

/**
 * UX-writer banned terms (word-boundary; "use cases" is the founder's hard
 * constraint, the rest are vocabulary-lock leaks). Checked on every
 * user-visible field of every VISIBLE row.
 */
const BANNED_IN_UI =
  /\b(use cases?|templates?|digests?|alerts?|feeds?|newsletters?|reports?|pro tier|tier|spec|config|coming soon|telegram|whatsapp)\b/i;

describe("template catalog — visibility & starters", () => {
  it("shows exactly 7 visible cards and exactly 3 starters", () => {
    expect(VISIBLE_TEMPLATES).toHaveLength(7);
    expect(STARTER_TEMPLATES).toHaveLength(3);
    for (const t of STARTER_TEMPLATES) expect(t.visible).toBe(true);
  });

  it("starters cover the three anchor-ICP categories, one each", () => {
    const starterCategories = STARTER_TEMPLATES.map((t) => t.category).sort();
    expect(starterCategories).toEqual([...VISIBLE_CATEGORY_ORDER].sort());
  });

  it("visible rows only use the three GA categories, every category labeled", () => {
    for (const t of VISIBLE_TEMPLATES) {
      expect(
        (VISIBLE_CATEGORY_ORDER as readonly string[]).includes(t.category),
        `template ${t.id} category ${t.category}`
      ).toBe(true);
      expect(TEMPLATE_CATEGORY_LABELS[t.category]).toBeTruthy();
    }
  });

  it("COPY_GUIDE §2 exclusion list can never be visible (a card is a promise)", () => {
    const excluded = [
      "flight_prices_tokyo", // travel
      "maybank_klse", // equity depth
      "tiktok_shop_eu", // off-ICP
      "bitcoin_crypto", // crypto
      "manu_match_odds", // sports betting
      "oss_releases", // off-ICP
      "kl_property_listings", // off-ICP
      "eperolehan_tenders", // gov tenders (unvalidated)
    ];
    for (const id of excluded) {
      const tpl = DIGEST_TEMPLATES.find((t) => t.id === id);
      // Retired ids are telemetry-load-bearing: they must exist AND stay hidden.
      expect(tpl, `retired template ${id} must keep its row`).toBeTruthy();
      expect(tpl!.visible, `retired template ${id} must stay hidden`).toBe(false);
    }
  });
});

describe("template catalog — card anatomy (UX-writer formula)", () => {
  it("visible labels are ≤4 words and end in 'brief' or 'watch'", () => {
    for (const t of VISIBLE_TEMPLATES) {
      const words = t.label.split(/\s+/).filter(Boolean);
      expect(words.length, `label "${t.label}"`).toBeLessThanOrEqual(4);
      expect(t.label, `label "${t.label}"`).toMatch(/\b(brief|watch)$/i);
    }
  });

  it("visible value lines are non-empty and ≤10 words", () => {
    for (const t of VISIBLE_TEMPLATES) {
      expect(t.description.trim().length, t.id).toBeGreaterThan(0);
      const words = t.description.split(/\s+/).filter(Boolean);
      expect(words.length, `description of ${t.id}`).toBeLessThanOrEqual(10);
    }
  });

  it("visible user-facing fields carry no banned vocabulary", () => {
    for (const t of VISIBLE_TEMPLATES) {
      for (const field of [
        t.label,
        t.description,
        t.exampleQuery,
        t.exampleHeadline ?? "",
      ]) {
        expect(field, `${t.id}: "${field}"`).not.toMatch(BANNED_IN_UI);
      }
    }
  });

  it("visible emojis are unique (scanability) ", () => {
    const emojis = VISIBLE_TEMPLATES.map((t) => t.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it("every visible card has seedHints.cadence so the hint renders from one source", () => {
    for (const t of VISIBLE_TEMPLATES) {
      expect(t.seedHints?.cadence, t.id).toBeTruthy();
      expect(formatCadenceHint(t.seedHints?.cadence), t.id).not.toBe("");
    }
  });

  it("every visible card has a forking question (chat voice, ≤12 words, exactly one ?)", () => {
    // PR 2: the post-tap interview contract hangs off this — confirm the
    // card's two slots, then ask exactly this one question. A trailing
    // imperative ("Name 2-5 companies.") is allowed; a second question is not.
    for (const t of VISIBLE_TEMPLATES) {
      expect(t.forkingQuestion, t.id).toBeTruthy();
      const words = t.forkingQuestion!.split(/\s+/).filter(Boolean);
      expect(words.length, `${t.id}: "${t.forkingQuestion}"`).toBeLessThanOrEqual(12);
      const questionMarks = (t.forkingQuestion!.match(/\?/g) ?? []).length;
      expect(questionMarks, `${t.id}: "${t.forkingQuestion}"`).toBe(1);
      expect(t.forkingQuestion, t.id).not.toMatch(BANNED_IN_UI);
    }
  });

  it("visible exampleQueries state the cadence the card promises", () => {
    // The query IS the user's first message — if it doesn't carry the
    // cadence the card displayed, the agent re-asks schedule and the
    // ≤3-questions contract dies on question one.
    for (const t of VISIBLE_TEMPLATES) {
      const freq = t.seedHints?.cadence?.frequency;
      expect(freq, t.id).toBeTruthy();
      expect(t.exampleQuery.toLowerCase(), `${t.id} should mention "${freq}"`).toContain(
        freq!
      );
    }
  });
});

describe("template catalog — seeding safety", () => {
  it("seedHints validate against the draft schema (agent-trustable shape)", () => {
    for (const t of DIGEST_TEMPLATES) {
      if (!t.seedHints) continue;
      const parsed = digestSpecDraftSchema.safeParse(t.seedHints);
      expect(
        parsed.success,
        `${t.id} seedHints: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`
      ).toBe(true);
    }
  });

  it("visible exampleQueries never trip our own multi-topic guard", () => {
    // Card taps auto-submit through the same server mirror that refuses
    // 3+-topic enumerations. A template that refuses its own user is a
    // broken promise — this pins it.
    for (const t of VISIBLE_TEMPLATES) {
      const detection = detectMultiTopic(t.exampleQuery);
      expect(detection.multiTopic, `${t.id}: "${t.exampleQuery}"`).toBe(false);
    }
  });

  it("visible exampleQueries classify back to their own template (first-hit scan)", () => {
    for (const t of VISIBLE_TEMPLATES) {
      const result = classifyTopic({ topicHint: t.exampleQuery });
      expect(result.templateId, `${t.id}: "${t.exampleQuery}"`).toBe(t.id);
    }
  });
});

describe("formatCadenceHint", () => {
  it("renders the canonical hints", () => {
    expect(
      formatCadenceHint({
        frequency: "daily",
        delivery_time_local: "07:30",
        days_of_week: [1, 2, 3, 4, 5],
      })
    ).toBe("Daily, weekday mornings");
    expect(
      formatCadenceHint({
        frequency: "weekly",
        delivery_time_local: "08:00",
        days_of_week: [1],
      })
    ).toBe("Weekly");
    expect(
      formatCadenceHint({
        frequency: "monthly",
        delivery_time_local: "08:00",
        days_of_week: [],
      })
    ).toBe("Monthly");
    expect(formatCadenceHint(undefined)).toBe("");
  });
});

describe("isKnownTemplateId", () => {
  it("accepts catalog ids (visible or retired) and rejects junk", () => {
    expect(isKnownTemplateId("palm_oil_mpob")).toBe(true);
    expect(isKnownTemplateId("bitcoin_crypto")).toBe(true); // retired but known
    expect(isKnownTemplateId("nonexistent")).toBe(false);
    expect(isKnownTemplateId(42)).toBe(false);
    expect(isKnownTemplateId(null)).toBe(false);
  });
});
