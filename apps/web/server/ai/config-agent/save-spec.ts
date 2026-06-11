/**
 * Production implementation of the `saveSpec` side-effect for the config
 * agent. Mirrors the logic in trpc/routers/digestSpec.updateRaw but is
 * callable from inside an Inngest function or chat route without going
 * through tRPC.
 *
 * CAD-212 brief-count gate (joint ruling 2026-06-11):
 *   - 0 non-archived briefs        -> plain insert (first brief).
 *   - at the cap (1; founder 2)    -> the save becomes an UPDATE of the
 *     existing brief: archive-then-replace the current row (the legacy
 *     single-brief versioning flow) and return a `notice` the chat
 *     surfaces. No silent data loss, no second brief.
 *   - under the cap with ≥1 brief  -> founder only. Inserts a genuinely
 *     NEW brief and leaves the existing brief running (status untouched);
 *     only `is_current` hands over so the legacy single-current invariant
 *     holds. Scheduled dispatch resolves by spec_id (see digest/run.ts),
 *     so the older brief keeps delivering.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestSpecs, users } from "@/server/db/schema";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import { ruleFromLegacyCadence } from "@/lib/scheduling/rule";
import { nextRunAt as computeNextRunAt } from "@/lib/scheduling/evaluator";
import { maxBriefsForEmail, SINGLE_BRIEF_NOTICE } from "@/server/briefs/limit";

const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur";

/**
 * Wave 4 Bug 7 fix: derive a user-facing brief name from the spec so the
 * /briefs list no longer shows "Untitled brief" for chat-saved briefs.
 * Prefers a topics[0] capitalized name; falls back to a generic label.
 */
function deriveBriefName(spec: DigestSpecV1): string {
  const t0 = spec.topics?.[0];
  if (typeof t0 === "string" && t0.trim().length > 0) {
    const trimmed = t0.trim();
    const head = trimmed[0]!.toUpperCase() + trimmed.slice(1);
    return `${head} brief`;
  }
  return "Untitled brief";
}

export async function saveSpecForUser(args: {
  userId: string;
  spec: DigestSpecV1;
}): Promise<{ id: string; version: number; notice?: string }> {
  return db.transaction(async (tx) => {
    // CAD-212: one user-row read serves both the brief-count gate (email
    // -> cap) and the Wave 4 Bug 7 scheduling derivation (timezone).
    const userRow = await tx
      .select({ timezone: users.timezone, email: users.email })
      .from(users)
      .where(eq(users.id, args.userId))
      .limit(1);
    const timezone = userRow[0]?.timezone ?? DEFAULT_TIMEZONE;
    const maxBriefs = maxBriefsForEmail(userRow[0]?.email);

    const existing = await tx
      .select({ id: digestSpecs.id })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, args.userId),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      );
    const atCap = existing.length >= maxBriefs;

    if (atCap) {
      // UPDATE path (single-brief flow): archive-then-replace the current
      // row — the pre-CAD-212 behavior, now reserved for exactly this
      // case. The old version stays recoverable in version history.
      await tx
        .update(digestSpecs)
        .set({ isCurrent: false, status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(digestSpecs.userId, args.userId),
            eq(digestSpecs.isCurrent, true)
          )
        );
    } else if (existing.length > 0) {
      // Founder under the cap: a real second brief. Hand over is_current
      // WITHOUT archiving — the existing brief keeps its status and its
      // next_run_at, so cron-dispatch (which claims by next_run_at and
      // resolves by spec_id) keeps delivering it.
      await tx
        .update(digestSpecs)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(
          and(
            eq(digestSpecs.userId, args.userId),
            eq(digestSpecs.isCurrent, true)
          )
        );
    }

    const latest = await tx
      .select({ version: digestSpecs.version })
      .from(digestSpecs)
      .where(eq(digestSpecs.userId, args.userId))
      .orderBy(desc(digestSpecs.version))
      .limit(1);

    const nextVersion = (latest[0]?.version ?? 0) + 1;

    // Wave 4 Bug 7: derive scheduling + name + next_run_at so the /briefs
    // card surfaces a real Schedule and Next delivery instead of fallback
    // placeholders. Pre-Wave-4 these columns were left at their schema
    // defaults ('{}' jsonb + "Untitled brief"), which broke the briefs
    // page for every chat-saved spec.
    const startDate = new Date().toISOString().slice(0, 10);
    const scheduling = ruleFromLegacyCadence({
      cadence: args.spec.cadence,
      timezone,
      startDate,
    });
    const next = computeNextRunAt(scheduling, new Date());
    const briefName = deriveBriefName(args.spec);

    const [inserted] = await tx
      .insert(digestSpecs)
      .values({
        userId: args.userId,
        version: nextVersion,
        spec: args.spec,
        isCurrent: true,
        createdVia: "chat_agent",
        name: briefName,
        scheduling,
        status: "active",
        tier: "default",
        nextRunAt: next,
      })
      .returning({ id: digestSpecs.id, version: digestSpecs.version });

    if (!inserted) {
      throw new Error("digestSpec insert returned no row");
    }
    // CAD-212: when the save was redirected into an update of the existing
    // brief, hand the chat a notice it can surface honestly.
    return atCap && existing.length > 0
      ? { ...inserted, notice: SINGLE_BRIEF_NOTICE }
      : inserted;
  });
}
