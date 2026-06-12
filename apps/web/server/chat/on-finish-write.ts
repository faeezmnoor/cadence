/**
 * onFinishThreadWrite — the pure set-object choice for the chat route's
 * onFinish thread persist (app/api/chat/route.ts), extracted so the
 * flag-on/flag-off branch is unit-testable without a route harness
 * (exec PR review round 1, CTO R3).
 *
 * T-408 / manage-mode plan §4.2 semantics, verbatim from the route:
 *
 *   - savedSpecId + flag ON  → write the spec binding, thread stays ALIVE
 *     (status untouched, i.e. remains 'active' — it becomes/remains a
 *     manage thread); draft_spec clears (canonical record is digest_specs).
 *   - savedSpecId + flag OFF → legacy terminal write status='completed'
 *     (§7.2 rollback contract); draft_spec clears.
 *   - no save, draft present → persist the working draft for the next turn.
 *   - neither → nothing beyond the per-turn updatedAt touch.
 *
 * The returned object deliberately EXCLUDES updatedAt — the call site
 * stamps `new Date()` on EVERY turn (exec advisory 10) regardless of which
 * row this helper picks.
 */
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";

export type OnFinishThreadWrite =
  | { specId: string; draftSpec: null }
  | { status: "completed"; draftSpec: null }
  | { draftSpec: DigestSpecDraft }
  | Record<string, never>;

export function onFinishThreadWrite(
  manageOn: boolean,
  savedSpecId: string | undefined,
  draft: DigestSpecDraft | undefined
): OnFinishThreadWrite {
  if (savedSpecId) {
    return manageOn
      ? { specId: savedSpecId, draftSpec: null }
      : { status: "completed", draftSpec: null };
  }
  if (draft) {
    return { draftSpec: draft };
  }
  return {};
}
