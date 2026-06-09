/**
 * Composer system prompt v2 (Stream A — brief-template-v1).
 *
 * v1 emitted free-form markdown driven by 10 instructions. v2 locks
 * the contract: the LLM emits a single JSON object matching
 * `briefJsonSchema`, with structure + voice anchored by two few-shot
 * exemplars in maximally different industries.
 *
 * Channel-agnostic — this prompt MUST NOT identify the output as a
 * "Telegram brief". It's just a daily research brief.
 *
 * Pure: no I/O, no LLM call.
 */
import { BRIEF_SCHEMA_VERSION } from "./schema";
import type { ComposerInput, ComposerSourcesBundle } from "./types";

const HARD_CHAR_CAP = 3800;

function yamlify(obj: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === "string") return `${pad}${JSON.stringify(obj)}`;
  if (typeof obj === "number" || typeof obj === "boolean") return `${pad}${obj}`;
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]`;
    return obj
      .map((v) => `${pad}- ${yamlify(v, 0).trimStart()}`)
      .join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries
      .map(([k, v]) => {
        const child = yamlify(v, indent + 2);
        if (
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          Object.keys(v as object).length > 0
        ) {
          return `${pad}${k}:\n${child}`;
        }
        if (Array.isArray(v) && v.length > 0) {
          return `${pad}${k}:\n${child}`;
        }
        return `${pad}${k}: ${yamlify(v, 0).trimStart()}`;
      })
      .join("\n");
  }
  return `${pad}${String(obj)}`;
}

function summarizeSources(sources: ComposerSourcesBundle): string {
  const parts: string[] = [];

  if (sources.search.length > 0) {
    parts.push("## Web search results");
    for (const bundle of sources.search) {
      parts.push(`### query: ${bundle.query}`);
      bundle.results.slice(0, 10).forEach((r, i) => {
        const age = r.age ? ` (${r.age})` : "";
        parts.push(`${i + 1}. [${r.title}](${r.url})${age}`);
        if (r.description) parts.push(`   ${r.description.slice(0, 280)}`);
      });
    }
  }

  if (sources.rss.length > 0) {
    parts.push("## RSS items (last 48h)");
    sources.rss.slice(0, 30).forEach((r, i) => {
      const when = r.publishedAt ? r.publishedAt.toISOString().slice(0, 16) : "?";
      parts.push(`${i + 1}. [${r.title}](${r.url}) — ${when} — _${r.feedUrl}_`);
      if (r.summary) parts.push(`   ${r.summary.slice(0, 240)}`);
    });
  }

  if (sources.prices && sources.prices.length > 0) {
    parts.push("## Prices");
    for (const p of sources.prices) {
      const ch24 =
        p.change24h !== undefined
          ? ` 24h ${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(2)}%`
          : "";
      const ch7 =
        p.change7d !== undefined
          ? ` / 7d ${p.change7d >= 0 ? "+" : ""}${p.change7d.toFixed(2)}%`
          : "";
      const cur = p.currency ? ` ${p.currency}` : "";
      parts.push(`- ${p.symbol}: ${p.price}${cur}${ch24}${ch7}`);
    }
  }

  return parts.join("\n") || "(no sources available)";
}

/* -------------------------------------------------------------------------- */
/* Few-shot exemplars                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Few-shot example 1: palm oil commodities, trader voice, prices on.
 * Hand-authored — never copied verbatim by the model.
 */
const FEWSHOT_PALM_OIL: string = JSON.stringify(
  {
    schema_version: 1,
    header: {
      date: "2 Jun 2026",
      cadence_label: "Daily",
      industry: "Palm oil & feedstock",
      personalization_summary:
        "KL plantation trader watching CPO, soyoil and Bursa planters",
    },
    tldr: "CPO holds RM3,920 (▼0.4%); MPOB lifts June export quota 12%; soyoil firms on US Midwest dryness [1][2].",
    sections: [
      {
        heading: "Prices",
        bullets: [
          {
            text: "CPO Aug: RM3,920 ▼0.4% 24h · ▲2.1% 7d — tight Bursa range, oversold RSI",
            citation_markers: [],
          },
          {
            text: "Soyoil 47.2¢/lb ▲1.1% on Midwest dryness forecast",
            citation_markers: [2],
          },
          {
            text: "Brent $82.4 — soft Asia demand, watch China crude imports Thu",
            citation_markers: [],
          },
        ],
      },
      {
        heading: "What moved",
        bullets: [
          {
            text: "MPOB raised June export quota 12% on May stock build-up — bearish near-term but supportive for sticky volume flows",
            citation_markers: [1],
          },
          {
            text: "China soy crush margins widened to 18-month high — bullish read-through for the vegoil complex",
            citation_markers: [3],
          },
        ],
      },
      {
        heading: "Watch this week",
        bullets: [
          {
            text: "Thu: Felda Q1 earnings call — consensus -8% YoY",
            citation_markers: [],
          },
          {
            text: "Fri: MPOB May stocks report — consensus 1.85m tonnes",
            citation_markers: [],
          },
        ],
      },
    ],
    why_it_matters:
      "Your CPO short held since May gets a near-term tailwind from the quota lift; soyoil long in the pair-trade is in the money on 7d. Felda earnings Thu is the next mark-to-market event for the basket.",
    feedback_cta: 'Reply 👍 / 👎 — or "tune: <what to change>"',
    sources: [
      {
        marker: 1,
        title: "MPOB — June export quota",
        url: "https://bepi.mpob.gov.my/export-quota-jun-26",
      },
      {
        marker: 2,
        title: "Reuters — Soyoil firms on Midwest weather",
        url: "https://reuters.com/markets/commodities/soyoil-weather-2026-06-01",
      },
      {
        marker: 3,
        title: "S&P Platts — China crush margins",
        url: "https://platts.com/oilseeds/china-crush-2026-w22",
      },
    ],
  },
  null,
  2
);

/**
 * Few-shot example 2: Malaysian halal F&B SME, casual-newsletter voice,
 * weekly cadence, NO prices, focus on channel + competitor + ops cost.
 *
 * Maximally different from example 1 so Haiku doesn't anchor on
 * trader-jargon for every brief.
 */
const FEWSHOT_HALAL_FNB: string = JSON.stringify(
  {
    schema_version: 1,
    header: {
      date: "Week of 26 May 2026",
      cadence_label: "Weekly",
      industry: "Malaysian halal F&B (frozen & ready-to-eat)",
      personalization_summary:
        "KL-based halal frozen-meals founder selling on Shopee + 7-Eleven, watching JAKIM, retailers and ringgit feedstock costs",
    },
    tldr: "Shopee 6.6 ramp begins Mon; JAKIM tightens slaughterhouse audits; chicken wholesale eases 4% WoW [1][2][3].",
    sections: [
      {
        heading: "Channel & retail",
        bullets: [
          {
            text: "Shopee 6.6 mid-year sale opens Mon 2 Jun — frozen halal SKUs eligible for platform-funded vouchers if you opt in by Wed",
            citation_markers: [1],
          },
          {
            text: "7-Eleven MY rotates ready-to-eat planogram next week; pitch window for new SKUs closes Fri",
            citation_markers: [4],
          },
        ],
      },
      {
        heading: "Regulatory",
        bullets: [
          {
            text: "JAKIM published tightened halal audit checklist for slaughterhouses — affects upstream suppliers, not packers directly, but expect price pass-through within 30 days",
            citation_markers: [2],
          },
        ],
      },
      {
        heading: "Costs",
        bullets: [
          {
            text: "Wholesale chicken eased 4% WoW to RM8.40/kg — first sustained drop since Feb",
            citation_markers: [3],
          },
          {
            text: "MYR/USD 4.71 — flat WoW; imported packaging steady",
            citation_markers: [],
          },
        ],
      },
      {
        heading: "Competitor watch",
        bullets: [
          {
            text: "Adabi launched a new RTE rendang line at RM12.90 — undercuts your premium tier by RM2; expect Shopee voucher stack to widen the gap during 6.6",
            citation_markers: [5],
          },
        ],
      },
    ],
    why_it_matters:
      "If chicken stays soft for another week your margin headroom funds a 6.6 voucher match against Adabi without dipping into Q3 budget. 7-Eleven pitch window is the bigger lever — that's a recurring shelf, not a sale spike.",
    feedback_cta: 'Reply 👍 / 👎 — or "tune: <what to change>"',
    sources: [
      {
        marker: 1,
        title: "Shopee MY — Seller Center 6.6 brief",
        url: "https://seller.shopee.com.my/edu/article/6-6-2026",
      },
      {
        marker: 2,
        title: "JAKIM — Halal slaughterhouse audit update",
        url: "https://www.halal.gov.my/v4/news/2026/audit-may",
      },
      {
        marker: 3,
        title: "DOSM — Wholesale price index May W4",
        url: "https://www.dosm.gov.my/v1/index.php?wpi-2026-w22",
      },
      {
        marker: 4,
        title: "The Edge — 7-Eleven MY planogram refresh",
        url: "https://theedgemalaysia.com/article/7-eleven-my-planogram-2026",
      },
      {
        marker: 5,
        title: "Adabi — New rendang RTE launch",
        url: "https://adabi.com.my/news/rendang-rte-2026",
      },
    ],
  },
  null,
  2
);

/* -------------------------------------------------------------------------- */
/* System prompt builder                                                      */
/* -------------------------------------------------------------------------- */

export function buildComposerSystemPrompt(input: ComposerInput): string {
  const { spec, sources, distilledPrefs, recentRawNotes } = input;
  const distilled =
    distilledPrefs && distilledPrefs.length > 0
      ? distilledPrefs.map((b) => `- ${b}`).join("\n")
      : "(none yet)";
  const recent =
    recentRawNotes && recentRawNotes.length > 0
      ? recentRawNotes.map((b) => `- ${b}`).join("\n")
      : "(none yet)";

  const specYaml = yamlify({
    topics: spec.topics,
    entities: spec.entities,
    keywords_include: spec.keywords_include,
    keywords_exclude: spec.keywords_exclude,
    data_addons: spec.data_addons,
    cadence: spec.cadence,
    tone_preset: spec.tone_preset,
    length_target: spec.length_target,
    language: spec.language,
  });

  /*
   * Wave 4 Bug 9 (P0): entities used to leak as flavor — the YAML dump
   * above embeds them but the model treats them as background colour and
   * happily composes around equivalent-but-different sources (e.g. the
   * user configured entities.companies=['ePerolehan'] for Malaysian gov
   * e-procurement and the model returned a brief about US SAM.gov + OECD
   * with no mention of ePerolehan or Malaysia). Anchor every non-empty
   * entity bucket as a HARD coverage requirement so the model knows it
   * MUST mention the configured names by exact label and treat them as
   * the spine of the brief.
   */
  const entityAnchors: string[] = [];
  const entCompanies = spec.entities?.companies ?? [];
  const entTickers = spec.entities?.tickers ?? [];
  const entCommodities = spec.entities?.commodities ?? [];
  if (entCompanies.length > 0) {
    entityAnchors.push(
      `companies / organizations / platforms: ${entCompanies
        .map((c) => `"${c}"`)
        .join(", ")}`
    );
  }
  if (entTickers.length > 0) {
    entityAnchors.push(
      `tickers: ${entTickers.map((t) => `\`${t}\``).join(", ")}`
    );
  }
  if (entCommodities.length > 0) {
    entityAnchors.push(
      `commodities: ${entCommodities.map((c) => `\`${c}\``).join(", ")}`
    );
  }
  const entityAnchorBlock =
    entityAnchors.length > 0
      ? [
          "ENTITY ANCHORS (HARD REQUIREMENT)",
          "Every entity below MUST be a direct subject of the brief — name it by",
          "exact label, ground its mention in the SOURCES block, and place it in",
          "the spine of the brief (tldr, at least one section, why_it_matters).",
          "If the SOURCES block has no usable signal for a named entity, say so",
          "in why_it_matters rather than swap in an unrelated lookalike (e.g.",
          "NEVER substitute SAM.gov for ePerolehan, NEVER substitute Brent for",
          "FCPO). User-named entities are the spine; everything else is context.",
          ...entityAnchors.map((a) => `- ${a}`),
          "",
        ]
      : [];

  return [
    "You are Cadence — a sharp trader-desk friend writing a 60-second morning note for a busy industry operator. Concrete, scannable, never corporate. You are NOT a chatbot; you are a senior market researcher delivering a daily report at a fraction of the cost of hiring one.",
    "",
    "OUTPUT CONTRACT",
    `Emit ONE JSON object matching this shape. \`schema_version\` MUST equal ${BRIEF_SCHEMA_VERSION}.`,
    "",
    "```",
    "{",
    `  "schema_version": ${BRIEF_SCHEMA_VERSION},`,
    '  "header": {',
    '    "date": "<human date, e.g. 2 Jun 2026>",',
    '    "cadence_label": "Daily" | "Weekly" | "Monthly",',
    '    "industry": "<short industry tag>",',
    '    "personalization_summary": "<1 line: who this brief is tuned for>"',
    "  },",
    '  "tldr": "<1-2 sentences. May carry [n] markers.>",',
    '  "sections": [',
    "    {",
    '      "heading": "<H2-style, 2-4 words>",',
    '      "bullets": [',
    '        { "text": "<bullet, may carry [n] markers>", "citation_markers": [<n>, ...] }',
    "      ]",
    "    }",
    "  ],",
    '  "why_it_matters": "<closer that ties the day\'s news to THIS user\'s spec / position>",',
    '  "feedback_cta": "Reply 👍 / 👎 — or \\"tune: <what to change>\\"",',
    '  "sources": [ { "marker": 1, "title": "<publisher / headline>", "url": "<https://...>" } ]',
    "}",
    "```",
    "",
    "HARD RULES",
    "1. Output JSON ONLY. No preamble, no code fences, no commentary outside the object.",
    `2. Total rendered length will be capped at ~${HARD_CHAR_CAP} characters; keep bullets tight.`,
    "3. `sections`: 1 to 5 (prefer 2-3). Each section: 1 to 5 bullets (prefer 2-3). Thin-signal days: 1 sharp section beats 3 padded ones.",
    "4. Citations: every `[n]` you write inline MUST appear in `sources[].marker`. Every source in `sources` MUST be cited somewhere in body. No orphans either way.",
    "5. Cite ONLY URLs that appear in the SOURCES block below. Do NOT invent URLs.",
    "6. `why_it_matters` is REQUIRED. Connect today's news to the user's spec, entities, or stated position. This is how we earn the daily delivery.",
    "7. Skip sections you don't have high-signal items for. Quality > quantity — emit 1 strong section before 3 thin ones.",
    "8. Respect `keywords_exclude` — never mention those topics. Apply LEARNED PREFERENCES and RECENT FEEDBACK aggressively.",
    "9. Write in the user's `language` setting (en / ms / zh). Headings and `feedback_cta` translate too.",
    "10. Voice: short sentences, numbers over adjectives, no \"in this brief we will…\" filler. Never identify the output as a Telegram message — it's just a brief.",
    "",
    "FEW-SHOT EXAMPLES",
    "These two examples teach SHAPE and VOICE, not facts. Different industries on purpose — do NOT copy specifics; do NOT anchor on commodity or F&B phrasing unless the user's spec calls for it. Cite ONLY URLs from the SOURCES block of the actual request.",
    "",
    "Example A — palm oil daily for a KL trader:",
    "```json",
    FEWSHOT_PALM_OIL,
    "```",
    "",
    "Example B — weekly Malaysian halal F&B for an SME founder:",
    "```json",
    FEWSHOT_HALAL_FNB,
    "```",
    "",
    "USER PROFILE",
    `- Tone preset: ${spec.tone_preset}`,
    `- Length target: ${spec.length_target}`,
    `- Language: ${spec.language}`,
    "",
    "LEARNED PREFERENCES (stable)",
    distilled,
    "",
    "RECENT FEEDBACK (most recent first)",
    recent,
    "",
    ...entityAnchorBlock,
    "DIGEST SPEC",
    specYaml,
    "",
    "SOURCES (already fetched and deduped — cite only these)",
    summarizeSources(sources),
    "",
    "Emit the JSON brief now.",
  ].join("\n");
}

export const COMPOSER_HARD_CHAR_CAP = HARD_CHAR_CAP;
