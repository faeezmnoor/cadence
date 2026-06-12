/**
 * ensureManageThread — find-or-lazily-create the ONE live manage thread for
 * a brief (manage-mode plan §4.2, AC7.2).
 *
 * First /chat?brief=<id> with no bound thread creates exactly one manage
 * thread, seeded with two deterministic assistant messages
 * (buildManageSeedSummary — no LLM, first paint never waits on a model).
 *
 * The partial unique index `chat_threads_spec_active_uq` (migration 0028)
 * is the race guard: a double-tab race — or racing the phase-2 reactivation
 * script — makes the second INSERT fail with a unique violation, which we
 * resolve by re-selecting the winner. A Sentry breadcrumb is logged when
 * that path fires (exec advisory 14): it's the one race unreproducible in
 * QA and we want prod evidence the recovery path works.
 *
 * Lazy-created threads use the existing unwired 'reconfigure' purpose —
 * provenance only; mode never reads purpose (§4.2).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads, type ChatThread } from "@/server/db/schema";
import { buildManageSeedSummary } from "@/server/chat/manage-seed";
import { log } from "@/lib/log";

export interface EnsureManageThreadArgs {
  userId: string;
  spec: {
    id: string;
    spec: unknown;
    scheduling: unknown;
  };
}

export interface EnsureManageThreadResult {
  thread: ChatThread;
  /** true when this call lazy-created (and seeded) the thread. */
  created: boolean;
}

/** Pg unique-violation sniffing across the drizzle/postgres-js wrap layers. */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: unknown; message?: unknown };
  if (e.code === "23505") return true;
  if (
    e.cause &&
    typeof e.cause === "object" &&
    (e.cause as { code?: unknown }).code === "23505"
  ) {
    return true;
  }
  const msg = typeof e.message === "string" ? e.message : "";
  return (
    msg.includes("chat_threads_spec_active_uq") ||
    msg.includes("duplicate key value")
  );
}

async function selectActiveBoundThread(
  userId: string,
  specId: string
): Promise<ChatThread | undefined> {
  const rows = await db
    .select()
    .from(chatThreads)
    .where(
      and(
        eq(chatThreads.userId, userId),
        eq(chatThreads.specId, specId),
        eq(chatThreads.status, "active")
      )
    )
    .orderBy(desc(chatThreads.updatedAt))
    .limit(1);
  return rows[0];
}

export async function ensureManageThread(
  args: EnsureManageThreadArgs
): Promise<EnsureManageThreadResult> {
  const existing = await selectActiveBoundThread(args.userId, args.spec.id);
  if (existing) return { thread: existing, created: false };

  try {
    const [inserted] = await db
      .insert(chatThreads)
      .values({
        userId: args.userId,
        purpose: "reconfigure",
        status: "active",
        specId: args.spec.id,
      })
      .returning();
    if (!inserted) {
      throw new Error("manage thread insert returned no row");
    }

    const [bubble1, bubble2] = buildManageSeedSummary({
      spec: args.spec.spec,
      scheduling: args.spec.scheduling,
    });
    // Two deterministic assistant rows in render order. Shape matches the
    // route's assistant_turn writer so the client renders them as normal
    // bubbles; `seeded: true` is provenance for analytics, ignored by UI.
    await db.insert(chatMessages).values([
      {
        threadId: inserted.id,
        role: "assistant",
        content: {
          kind: "assistant_turn",
          text: bubble1,
          toolCalls: [],
          toolResults: [],
          seeded: true,
        },
      },
      {
        threadId: inserted.id,
        role: "assistant",
        content: {
          kind: "assistant_turn",
          text: bubble2,
          toolCalls: [],
          toolResults: [],
          seeded: true,
        },
      },
    ]);

    return { thread: inserted, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Lost the race against a parallel tab or the phase-2 reactivation
    // script — the partial unique index held. Re-select the winner and
    // leave prod evidence (exec advisory 14).
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.addBreadcrumb({
        category: "manage-thread",
        message: "lazy-create unique violation — re-selected winner",
        level: "info",
        data: { specId: args.spec.id },
      });
    } catch {
      // Breadcrumbs are best-effort; never fail resolution over telemetry.
    }
    log.warn("manage-thread lazy-create raced; re-selecting winner", {
      specId: args.spec.id,
      userId: args.userId,
    });

    const winner = await selectActiveBoundThread(args.userId, args.spec.id);
    if (!winner) throw err;
    return { thread: winner, created: false };
  }
}
