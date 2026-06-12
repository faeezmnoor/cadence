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
import { isDeepStrictEqual } from "node:util";
import type { DigestSpecDraft } from "@/lib/digest-spec/schema";

export type OnFinishThreadWrite =
  | { specId: string; draftSpec: null }
  | { status: "completed"; draftSpec: null }
  | { draftSpec: DigestSpecDraft | null }
  | Record<string, never>;

export function onFinishThreadWrite(
  manageOn: boolean,
  savedSpecId: string | undefined,
  draft: DigestSpecDraft | undefined,
  /**
   * CTO A3 (exec PR review round 1): the bound SAVED spec rendered as a
   * draft (manage turns pass specToDraft(boundSpec.spec); setup turns pass
   * undefined). Manage turns seed the working draft from the saved spec, so
   * without this check every manage turn persisted that seed to
   * chat_threads.draft_spec — a stale-snapshot landmine: hydration prefers
   * thread.draftSpec, so a later out-of-band spec change would be masked by
   * the frozen copy. When the working draft still equals the saved spec
   * there is nothing staged — clear draft_spec instead of persisting the
   * redundant snapshot (clearing also heals threads that already carry one,
   * and covers a staged edit the user reverted back to saved state).
   */
  boundSpecDraft?: DigestSpecDraft
): OnFinishThreadWrite {
  if (savedSpecId) {
    return manageOn
      ? { specId: savedSpecId, draftSpec: null }
      : { status: "completed", draftSpec: null };
  }
  if (draft) {
    if (boundSpecDraft && isDeepStrictEqual(draft, boundSpecDraft)) {
      return { draftSpec: null };
    }
    return { draftSpec: draft };
  }
  return {};
}
