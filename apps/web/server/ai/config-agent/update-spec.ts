/**
 * updateSpecInPlace — production implementation of the manage agent's
 * `updateSpec` side-effect (manage-mode plan §4.3.3, locked decision 2).
 *
 * In-place edit of the EXISTING digest_specs row: same id forever,
 * `spec` jsonb replaced, `version` + 1, name recomputed via the lifted
 * deriveBriefName, scheduling + next_run_at recomputed ONLY when the
 * cadence changed. No revision/snapshot table — `version` is an integer
 * increment only.
 *
 * ZERO cap interaction (AC3.2 / AC6.1 / CAD-212): this module must NEVER
 * import or call `saveSpecForUser` or `server/briefs/limit` — an edit is
 * not a new brief, so the brief-count gate (and its archive-and-replace
 * behavior at cap) must be unreachable from here. Asserted by a
 * module-mock test (test/update-spec-in-place.test.ts).
 *
 * B2-hard note (no scope expansion): like `confirm_and_save`, this is the
 * agent-mediated-save class. The future deterministic-server-save hardening
 * covers both via the same choke points (updateSpecInPlace / saveSpecForUser)
 * — do not conflate the two paths when reviewing.
 *
 * Guards (fail closed, throw → safeExecute envelope → agent phrases it):
 *   - row must exist AND belong to userId (service-role client: the
 *     explicit userId filter IS the authorization)
 *   - status must not be 'archived' (AC8.1)
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestSpecs } from "@/server/db/schema";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import { deriveBriefName } from "@/lib/brief-display";
import { ruleFromLegacyCadence } from "@/lib/scheduling/rule";
import { nextRunAt as computeNextRunAt } from "@/lib/scheduling/evaluator";
import { log } from "@/lib/log";

const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";

/** Top-level keys whose values differ between two specs (analytics only). */
export function changedTopLevelKeys(
  before: unknown,
  after: DigestSpecV1
): string[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
  }
  return changed.sort();
}

export async function updateSpecInPlace(args: {
  userId: string;
  specId: string;
  spec: DigestSpecV1;
}): Promise<{ id: string; version: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: digestSpecs.id,
        version: digestSpecs.version,
        spec: digestSpecs.spec,
        status: digestSpecs.status,
        scheduling: digestSpecs.scheduling,
      })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.id, args.specId),
          eq(digestSpecs.userId, args.userId)
        )
      )
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      throw new Error("this brief no longer exists — nothing was changed");
    }
    if (existing.status === "archived") {
      throw new Error(
        "this brief is archived, so it can't be changed from here — nothing was changed"
      );
    }

    const oldSpec = (existing.spec ?? {}) as Partial<DigestSpecV1>;
    const cadenceChanged =
      JSON.stringify(oldSpec.cadence ?? null) !==
      JSON.stringify(args.spec.cadence);

    const set: Record<string, unknown> = {
      spec: args.spec,
      version: existing.version + 1,
      name: deriveBriefName(args.spec),
      updatedAt: new Date(),
    };

    if (cadenceChanged) {
      // Timezone is snapshot-immutable per spec (schema docstring): reuse
      // the existing rule's timezone; fall back to the app default only for
      // legacy '{}' scheduling rows.
      const oldRule = (existing.scheduling ?? {}) as {
        timezone?: string;
      };
      const timezone = oldRule.timezone || DEFAULT_TIMEZONE;
      const startDate = new Date().toISOString().slice(0, 10);
      const scheduling = ruleFromLegacyCadence({
        cadence: args.spec.cadence,
        timezone,
        startDate,
      });
      set.scheduling = scheduling;
      // next_run_at is NULL for paused rows by invariant (schema docstring);
      // the resume flow recomputes it. Only active rows get a real hint.
      set.nextRunAt =
        existing.status === "active"
          ? computeNextRunAt(scheduling, new Date())
          : null;
    }

    const [updated] = await tx
      .update(digestSpecs)
      .set(set)
      .where(
        and(
          eq(digestSpecs.id, args.specId),
          eq(digestSpecs.userId, args.userId),
          ne(digestSpecs.status, "archived")
        )
      )
      .returning({ id: digestSpecs.id, version: digestSpecs.version });
    if (!updated) {
      // Archived between the read and the write — fail closed (AC8.1).
      throw new Error(
        "this brief is archived, so it can't be changed from here — nothing was changed"
      );
    }

    // ACX.5 analytics: brief_edit_applied. Fired here (not in the tool) so
    // the eval harness's stubbed updateSpec stays silent.
    log.info("brief_edit_applied", {
      userId: args.userId,
      specId: updated.id,
      version_from: existing.version,
      version_to: updated.version,
      fields_changed: changedTopLevelKeys(existing.spec, args.spec),
    });

    return updated;
  });
}
