/**
 * Multi-brief techdesign §7 — Reset session bug fix.
 *
 * Asserts that `chat.resetThread`:
 *   1. Soft-archives messages on the prior thread (so resume-on-reload
 *      of the old id doesn't replay them).
 *   2. Marks the prior thread as status='archived' (so /chat/page.tsx
 *      stops picking it as the active thread on refresh).
 *   3. Inserts a BRAND-NEW chat_threads row with status='active' and a
 *      different id, and returns that new id to the client.
 *
 * The new id is what unmounts/remounts <ChatClient> via key={thread.id},
 * which keys a fresh Vercel-AI-SDK `useChat` store with empty messages.
 * Without a new id, the hook keeps the prior `messages` array and forwards
 * it back into streamText on the next user turn — the bug we're fixing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;

interface ThreadRow {
  id: string;
  userId: string;
  purpose: string;
  status: string;
  draftSpec: unknown;
}

const PRIOR_THREAD_ID = "11111111-1111-1111-1111-111111111111";
const NEW_THREAD_ID = "99999999-9999-9999-9999-999999999999";
const USER_ID = "u-self";

const threadsStore: Record<string, ThreadRow> = {};
const messagesArchiveCalls: Array<{ threadId: string }> = [];
const threadUpdateCalls: Array<{ id: string; set: Row }> = [];
const threadInsertCalls: Array<{ values: Row }> = [];

function reset() {
  for (const k of Object.keys(threadsStore)) delete threadsStore[k];
  threadsStore[PRIOR_THREAD_ID] = {
    id: PRIOR_THREAD_ID,
    userId: USER_ID,
    purpose: "initial_config",
    status: "active",
    draftSpec: { topics: ["palm oil"] },
  };
  messagesArchiveCalls.length = 0;
  threadUpdateCalls.length = 0;
  threadInsertCalls.length = 0;
}

// Fake drizzle chain. We don't evaluate predicates — we mark "what the
// router asked us to do" and verify behaviourally.
function makeFakeDb() {
  let currentTable: "chatThreads" | "chatMessages" | null = null;

  const select = (_proj?: unknown) => ({
    from(table: unknown) {
      currentTable = (table as { __name?: string }).__name === "chat_messages"
        ? "chatMessages"
        : "chatThreads";
      return {
        where(_p: unknown) {
          return {
            limit(_n: number) {
              // chat router's resetThread does select(threadId+userId).
              // Return the prior thread if it's still in the store.
              const row = threadsStore[PRIOR_THREAD_ID];
              if (!row) return Promise.resolve([]);
              return Promise.resolve([
                { id: row.id, purpose: row.purpose },
              ]);
            },
          };
        },
      };
    },
  });

  const update = (table: unknown) => {
    const tableName = (table as { __name?: string }).__name;
    let pendingSet: Row = {};
    const chain = {
      set(p: Row) {
        pendingSet = p;
        return chain;
      },
      where(_p: unknown) {
        if (tableName === "chat_messages") {
          messagesArchiveCalls.push({ threadId: PRIOR_THREAD_ID });
        } else {
          threadUpdateCalls.push({ id: PRIOR_THREAD_ID, set: pendingSet });
          // Reflect status change into the store so behaviour is observable.
          const row = threadsStore[PRIOR_THREAD_ID];
          if (row) {
            if (typeof pendingSet.status === "string") {
              row.status = pendingSet.status;
            }
            if (pendingSet.draftSpec === null) {
              row.draftSpec = null;
            }
          }
        }
        return Promise.resolve();
      },
    };
    return chain;
  };

  const insert = (_table: unknown) => ({
    values(v: Row) {
      threadInsertCalls.push({ values: v });
      return {
        returning() {
          const created: ThreadRow = {
            id: NEW_THREAD_ID,
            userId: v.userId as string,
            purpose: v.purpose as string,
            status: v.status as string,
            draftSpec: null,
          };
          threadsStore[NEW_THREAD_ID] = created;
          return Promise.resolve([created]);
        },
      };
    },
  });

  const db = {
    select,
    update,
    insert,
    transaction: async <T,>(
      fn: (tx: {
        update: typeof update;
        insert: typeof insert;
      }) => Promise<T>
    ) => fn({ update, insert }),
  };
  // Silence unused warnings
  void currentTable;
  return db;
}

vi.mock("@/server/db/client", () => ({
  db: makeFakeDb(),
}));

// Tag schema tables so the fake db can route by name.
vi.mock("@/server/db/schema", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    chatThreads: { __name: "chat_threads" },
    chatMessages: { __name: "chat_messages" },
  };
});

import { appRouter } from "@/server/trpc/root";

function makeCtx() {
  return {
    user: { id: USER_ID, email: "x@example.com" },
    supabase: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0];
}

beforeEach(() => {
  reset();
});

describe("chat.resetThread — fresh-thread fix", () => {
  it("returns a NEW threadId different from the input threadId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.resetThread({ threadId: PRIOR_THREAD_ID });
    expect(result.ok).toBe(true);
    expect(result.newThreadId).toBeDefined();
    expect(result.newThreadId).not.toBe(PRIOR_THREAD_ID);
    expect(result.newThreadId).toBe(NEW_THREAD_ID);
  });

  it("archives the prior thread and inserts a fresh active replacement", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.resetThread({ threadId: PRIOR_THREAD_ID });

    // Prior thread is archived + draftSpec nulled.
    expect(threadUpdateCalls).toHaveLength(1);
    expect(threadUpdateCalls[0]!.set.status).toBe("archived");
    expect(threadUpdateCalls[0]!.set.draftSpec).toBeNull();
    expect(threadsStore[PRIOR_THREAD_ID]!.status).toBe("archived");
    expect(threadsStore[PRIOR_THREAD_ID]!.draftSpec).toBeNull();

    // Messages on the prior thread were soft-archived.
    expect(messagesArchiveCalls).toHaveLength(1);
    expect(messagesArchiveCalls[0]!.threadId).toBe(PRIOR_THREAD_ID);

    // A brand-new active thread was inserted with the same purpose,
    // owned by the same user, and with no draftSpec — guaranteed clean
    // slate for the next useChat instance.
    expect(threadInsertCalls).toHaveLength(1);
    expect(threadInsertCalls[0]!.values).toMatchObject({
      userId: USER_ID,
      purpose: "initial_config",
      status: "active",
    });
    expect(threadInsertCalls[0]!.values.draftSpec).toBeUndefined();

    // New thread exists in the store and is the one /chat/page.tsx would
    // pick on its next render (active + most recent).
    expect(threadsStore[NEW_THREAD_ID]!.status).toBe("active");
    expect(threadsStore[NEW_THREAD_ID]!.draftSpec).toBeNull();
  });

  it("throws NOT_FOUND for a thread the user doesn't own", async () => {
    // Remove the prior thread to simulate "no row matched user+id".
    delete threadsStore[PRIOR_THREAD_ID];
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.chat.resetThread({ threadId: PRIOR_THREAD_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // No writes attempted.
    expect(threadUpdateCalls).toHaveLength(0);
    expect(threadInsertCalls).toHaveLength(0);
    expect(messagesArchiveCalls).toHaveLength(0);
  });
});
