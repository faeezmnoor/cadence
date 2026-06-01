/**
 * Draft helpers for the config agent.
 *
 * The agent builds a DigestSpec incrementally. We hold the in-progress
 * shape as `DigestSpecDraft` (everything optional) and only validate
 * against the strict `digestSpecSchema` at confirm-and-save time.
 *
 * `setByPath` supports dot-notation paths like `cadence.delivery_time_local`
 * so the `update_spec_field` tool stays ergonomic for the LLM to call.
 *
 * NOTE: this intentionally does NOT use lodash — we want zero extra deps
 * for what amounts to ~30 lines of code.
 */
import {
  DIGEST_SPEC_SCHEMA_VERSION,
  digestSpecDraftSchema,
  digestSpecSchema,
  type DigestSpecDraft,
  type DigestSpecV1,
} from "@/lib/digest-spec/schema";

/** Allowed top-level keys for `update_spec_field`. */
export const UPDATABLE_TOP_LEVEL_KEYS = [
  "topics",
  "entities",
  "keywords_include",
  "keywords_exclude",
  "data_addons",
  "rss_feeds",
  "cadence",
  "tone_preset",
  "length_target",
  "language",
] as const;

export type UpdatableTopLevelKey = (typeof UPDATABLE_TOP_LEVEL_KEYS)[number];

/** Returns a fresh empty draft (schema_version pinned). */
export function emptyDraft(): DigestSpecDraft {
  return { schema_version: DIGEST_SPEC_SCHEMA_VERSION };
}

/**
 * Set a dot-notation path on a draft, returning a new object.
 *
 * Rules:
 *  - First segment must be one of the known DigestSpec top-level keys.
 *  - Nested writes only auto-create plain object containers (not arrays).
 *  - Final write replaces the existing value at the leaf.
 *
 * Validates the result against `digestSpecDraftSchema` so the LLM can't
 * sneak a malformed branch (e.g. wrong type on `cadence.frequency`)
 * into the draft.
 */
export function setByPath(
  draft: DigestSpecDraft,
  path: string,
  value: unknown
): DigestSpecDraft {
  if (!path || typeof path !== "string") {
    throw new Error("path must be a non-empty string");
  }
  const segments = path.split(".");
  const top = segments[0];
  if (!UPDATABLE_TOP_LEVEL_KEYS.includes(top as UpdatableTopLevelKey)) {
    throw new Error(
      `path "${path}" is not updatable; top-level key must be one of: ${UPDATABLE_TOP_LEVEL_KEYS.join(", ")}`
    );
  }

  // Deep clone via structuredClone so callers don't mutate the original.
  const next: Record<string, unknown> = structuredClone(draft) as Record<
    string,
    unknown
  >;

  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const existing = cursor[seg];
    if (existing === undefined || existing === null) {
      cursor[seg] = {};
    } else if (typeof existing !== "object" || Array.isArray(existing)) {
      throw new Error(
        `cannot descend into "${segments.slice(0, i + 1).join(".")}" — value is not an object`
      );
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;

  const parsed = digestSpecDraftSchema.safeParse(next);
  if (!parsed.success) {
    throw new Error(
      `update would produce invalid draft: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

/**
 * Merge a proposed full-or-partial spec onto the current draft. Used by
 * `propose_spec` so the agent can hand in a draft body in one shot and we
 * still re-validate via the draft schema before storing.
 */
export function mergeProposal(
  draft: DigestSpecDraft,
  proposal: DigestSpecDraft
): DigestSpecDraft {
  const merged: DigestSpecDraft = {
    ...draft,
    ...proposal,
    schema_version: DIGEST_SPEC_SCHEMA_VERSION,
  };
  const parsed = digestSpecDraftSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      `proposal would produce invalid draft: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

/**
 * Promote a draft into a strict DigestSpec, or throw with a readable error
 * listing every Zod failure. Used by `confirm_and_save`.
 */
export function finalizeDraft(draft: DigestSpecDraft): DigestSpecV1 {
  const candidate = {
    ...draft,
    schema_version: DIGEST_SPEC_SCHEMA_VERSION,
  };
  const parsed = digestSpecSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `draft is incomplete; cannot save: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}
