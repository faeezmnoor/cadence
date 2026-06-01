/**
 * DigestSpec v1 — the structured shape of what a user has told the config agent
 * they want briefed. This is the moat. Every persistence write to
 * `digest_specs.spec` must pass through this schema.
 *
 * Source of truth: blueprint/04-data-model-and-apis.md
 */
import { z } from "zod";

export const DIGEST_SPEC_SCHEMA_VERSION = 1 as const;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,15}$/i; // permissive: SDP.KL, CPO=F, ^GSPC

/** "08:00" 24-hour local time */
export const localTimeSchema = z
  .string()
  .regex(HHMM_RE, "must be HH:MM 24-hour");

/** Day-of-week using ISO 8601: 1=Mon ... 7=Sun. Empty == every day. */
export const daysOfWeekSchema = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .refine(
    (xs) => new Set(xs).size === xs.length,
    "days_of_week must not contain duplicates"
  );

export const cadenceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    delivery_time_local: localTimeSchema,
    days_of_week: daysOfWeekSchema.default([1, 2, 3, 4, 5]),
  })
  .strict();

export const entitiesSchema = z
  .object({
    companies: z.array(z.string().min(1).max(120)).max(50).default([]),
    tickers: z
      .array(
        z
          .string()
          .min(1)
          .max(16)
          .regex(TICKER_RE, "ticker looks invalid")
      )
      .max(50)
      .default([]),
    commodities: z
      .array(
        z
          .string()
          .min(1)
          .max(16)
          .regex(TICKER_RE, "commodity symbol looks invalid")
      )
      .max(50)
      .default([]),
  })
  .strict();

export const dataAddonsSchema = z
  .object({
    show_prices: z.boolean().default(false),
    show_24h_change: z.boolean().default(true),
    show_7d_change: z.boolean().default(false),
    fx_pairs: z
      .array(
        z
          .string()
          .regex(/^[A-Z]{3}\/[A-Z]{3}$/, "fx pair must be like MYR/USD")
      )
      .max(10)
      .default([]),
  })
  .strict();

export const rssFeedSchema = z
  .object({
    url: z.string().url().max(500),
    label: z.string().min(1).max(80),
  })
  .strict();

export const toneSchema = z.enum([
  "executive_brief",
  "analyst_deep_dive",
  "trader_quick_take",
  "casual_newsletter",
]);

export const lengthSchema = z.enum(["short", "medium", "long"]);

export const languageSchema = z.enum(["en", "ms", "zh"]);

export const digestSpecSchema = z
  .object({
    schema_version: z.literal(DIGEST_SPEC_SCHEMA_VERSION),
    topics: z.array(z.string().min(1).max(120)).min(1).max(20),
    entities: entitiesSchema.default({
      companies: [],
      tickers: [],
      commodities: [],
    }),
    keywords_include: z.array(z.string().min(1).max(80)).max(50).default([]),
    keywords_exclude: z.array(z.string().min(1).max(80)).max(50).default([]),
    data_addons: dataAddonsSchema.default({
      show_prices: false,
      show_24h_change: true,
      show_7d_change: false,
      fx_pairs: [],
    }),
    rss_feeds: z.array(rssFeedSchema).max(20).default([]),
    cadence: cadenceSchema,
    tone_preset: toneSchema.default("executive_brief"),
    length_target: lengthSchema.default("short"),
    language: languageSchema.default("en"),
  })
  .strict();

export type DigestSpecV1 = z.infer<typeof digestSpecSchema>;
export type DigestSpecInput = z.input<typeof digestSpecSchema>;

/**
 * Partial draft used by the config agent while it's still gathering info.
 * Same fields as full spec, but everything optional and topics may be empty.
 * The `confirm_and_save` tool re-validates the draft against `digestSpecSchema`
 * before write.
 */
export const digestSpecDraftSchema = digestSpecSchema
  .partial()
  .extend({ schema_version: z.literal(DIGEST_SPEC_SCHEMA_VERSION).optional() });

export type DigestSpecDraft = z.infer<typeof digestSpecDraftSchema>;

/** Minimal valid spec — useful for tests and as an agent starter template. */
export const emptyDigestSpec = (): DigestSpecV1 =>
  digestSpecSchema.parse({
    schema_version: DIGEST_SPEC_SCHEMA_VERSION,
    topics: ["TBD"],
    cadence: {
      frequency: "daily",
      delivery_time_local: "08:00",
      days_of_week: [1, 2, 3, 4, 5],
    },
  });
