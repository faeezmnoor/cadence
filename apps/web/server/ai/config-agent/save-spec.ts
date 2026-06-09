/**
 * Production implementation of the `saveSpec` side-effect for the config
 * agent. Mirrors the logic in trpc/routers/digestSpec.updateRaw but is
 * callable from inside an Inngest function or chat route without going
 * through tRPC.
 *
 * Both paths flip the previous current row and insert a new version atomically.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { digestSpecs, users } from "@/server/db/schema";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";
import { ruleFromLegacyCadence } from "@/lib/scheduling/rule";
import { nextRunAt as computeNextRunAt } from "@/lib/scheduling/evaluator";

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
}): Promise<{ id: string; version: number }> {
  return db.transaction(async (tx) => {
    await tx
      .update(digestSpecs)
      .set({ isCurrent: false, status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(digestSpecs.userId, args.userId),
          eq(digestSpecs.isCurrent, true)
        )
      );

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
    const userRow = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, args.userId))
      .limit(1);
    const timezone = userRow[0]?.timezone ?? DEFAULT_TIMEZONE;
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
    return inserted;
  });
}
