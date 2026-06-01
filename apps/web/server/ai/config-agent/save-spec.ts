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
import { digestSpecs } from "@/server/db/schema";
import type { DigestSpecV1 } from "@/lib/digest-spec/schema";

export async function saveSpecForUser(args: {
  userId: string;
  spec: DigestSpecV1;
}): Promise<{ id: string; version: number }> {
  return db.transaction(async (tx) => {
    await tx
      .update(digestSpecs)
      .set({ isCurrent: false, updatedAt: new Date() })
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

    const [inserted] = await tx
      .insert(digestSpecs)
      .values({
        userId: args.userId,
        version: nextVersion,
        spec: args.spec,
        isCurrent: true,
        createdVia: "chat_agent",
      })
      .returning({ id: digestSpecs.id, version: digestSpecs.version });

    if (!inserted) {
      throw new Error("digestSpec insert returned no row");
    }
    return inserted;
  });
}
