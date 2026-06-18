/**
 * Client-safe web-search provider registry (CAD-165 / CAD-228, D-011).
 *
 * The user-facing list of selectable Standard-stack search providers, mirrored
 * from the server registry (server/ai/providers/searchers.ts) but free of any
 * server imports so it ships in the browser bundle for the settings picker.
 * Ids stay in lockstep with SEARCHER_IDS + the DB CHECK (a structural test
 * guards the drift).
 *
 * Applies to the STANDARD stack's web search only — advanced research runs
 * its own search and ignores this selection (Decisions Log D-011).
 */
export type SearcherId = "brave" | "duckduckgo";

export interface SearcherOption {
  id: SearcherId;
  label: string;
  description: string;
  /** True when the provider needs no API key (a reliable always-on backup). */
  keyless: boolean;
}

export const DEFAULT_SEARCHER_ID: SearcherId = "brave";

export const SEARCHER_OPTIONS: readonly SearcherOption[] = [
  {
    id: "brave",
    label: "Brave Search",
    description: "The default — broad web coverage with fresh news.",
    keyless: false,
  },
  {
    id: "duckduckgo",
    label: "DuckDuckGo",
    description:
      "Keyless and privacy-first. A dependable backup that never needs a key.",
    keyless: true,
  },
];

export function normalizeSearcherId(raw: unknown): SearcherId {
  return raw === "duckduckgo" ? "duckduckgo" : DEFAULT_SEARCHER_ID;
}

export function searcherLabel(id: unknown): string {
  const norm = normalizeSearcherId(id);
  return SEARCHER_OPTIONS.find((o) => o.id === norm)?.label ?? "Brave Search";
}
