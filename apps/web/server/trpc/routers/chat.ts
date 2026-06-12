/**
 * chat.* — thread lifecycle for the config agent.
 *
 * Token-level streaming happens at /api/chat (Vercel AI SDK route handler),
 * not here — tRPC procedures are request/response. This router is the
 * boring side: create/list threads, list messages, mark complete.
 *
 * Why both?
 *  - Streaming via tRPC means inventing our own SSE/Stream protocol that
 *    `useChat` doesn't speak. Fighting the framework for no gain.
 *  - But thread lifecycle (resume on reload — T-108) wants the same auth
 *    + db boundary as the rest of the app. Keep it in tRPC.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads } from "@/server/db/schema";
import { protectedProcedure, router } from "../trpc";

const PURPOSES = ["initial_config", "reconfigure"] as const;

export const chatRouter = router({
  /**
   * Start a fresh thread, or return the most recent active thread of the
   * same purpose if one exists. This is the "resume on reload" hinge —
   * the chat page calls this on mount and always gets a thread id back,
   * either new or existing.
   */
  startThread: protectedProcedure
    .input(
      z
        .object({
          purpose: z.enum(PURPOSES).default("initial_config"),
        })
        .default({ purpose: "initial_config" })
    )
    .mutation(async ({ ctx, input }) => {
      // Prefer an active thread of the same purpose if one exists.
      // Manage mode: spec-bound threads are never "a fresh start" — the
      // isNull filter keeps startThread from handing back a manage thread
      // (lazy-created manage threads share purpose='reconfigure').
      const existing = await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, ctx.user.id),
            eq(chatThreads.purpose, input.purpose),
            eq(chatThreads.status, "active"),
            isNull(chatThreads.specId)
          )
        )
        .orderBy(desc(chatThreads.createdAt))
        .limit(1);

      if (existing[0]) return existing[0];

      const [inserted] = await db
        .insert(chatThreads)
        .values({
          userId: ctx.user.id,
          purpose: input.purpose,
          status: "active",
        })
        .returning();

      if (!inserted) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create chat thread",
        });
      }
      return inserted;
    }),

  /**
   * Fetch a thread by id, scoped to the current user. Used by /api/chat
   * route on every turn to validate ownership before streaming.
   */
  getThread: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return rows[0];
    }),

  /**
   * Replay messages for a thread, oldest-first, for hydration on page load.
   * The chat client converts these into the AI SDK `Message[]` shape.
   *
   * Note: `chat_messages.content` is jsonb — we keep it opaque here and
   * let the client interpret. Today: `{kind: "user_text", text} |
   * {kind: "assistant_text", text} | {kind: "tool_call", ...} |
   * {kind: "tool_result", ...}`. The chat route writes that shape.
   */
  listMessages: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify thread ownership first.
      const owned = await db
        .select({ id: chatThreads.id })
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!owned[0]) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return db
        .select({
          id: chatMessages.id,
          role: chatMessages.role,
          content: chatMessages.content,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, input.threadId),
            isNull(chatMessages.archivedAt)
          )
        )
        .orderBy(asc(chatMessages.createdAt));
    }),

  /**
   * T-413 / CAD-73: Reset a chat conversation.
   *
   * Bug-fix wave (multi-brief techdesign §7): the Vercel AI SDK's `useChat`
   * hook keys its in-memory message store off the `id` prop (= threadId).
   * Soft-archiving messages + nulling draftSpec on the SAME thread leaves
   * the client-side hook holding the prior `messages` array, which gets
   * forwarded back into `streamText` on the next user turn — contaminating
   * the supposedly "fresh" capture session.
   *
   * Fix: archive the existing thread (terminal-but-readable), then INSERT a
   * brand-new active thread for the same purpose and return its id. The
   * client navigates to it (or /chat/page.tsx auto-picks the most recent
   * active thread on refresh) and re-mounts `<ChatClient key={thread.id}>`,
   * which keys a fresh useChat store with empty messages.
   *
   * Messages on the old thread are also archived so resume-on-reload of
   * the old id (if anyone bookmarked it) doesn't replay them.
   */
  resetThread: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const owned = await db
        .select({
          id: chatThreads.id,
          purpose: chatThreads.purpose,
          specId: chatThreads.specId,
        })
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!owned[0]) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return await db.transaction(async (tx) => {
        // 1. Soft-archive every visible message on the prior thread.
        await tx
          .update(chatMessages)
          .set({ archivedAt: sql`now()` })
          .where(
            and(
              eq(chatMessages.threadId, input.threadId),
              isNull(chatMessages.archivedAt)
            )
          );

        // 2. Mark the prior thread archived so /chat doesn't resume it and
        //    the useChat store keyed off its id is never revisited.
        await tx
          .update(chatThreads)
          .set({
            status: "archived",
            draftSpec: null,
            updatedAt: new Date(),
          })
          .where(eq(chatThreads.id, input.threadId));

        // 3. Spin up a brand-new active thread for the same purpose. Its
        //    fresh id is what unmounts/remounts useChat on the client.
        //
        //    Manage mode (plan §4.2, C6): the specId binding CARRIES OVER to
        //    the replacement thread — resetting a manage thread must not
        //    silently degrade it to a setup thread (whose confirm_and_save
        //    path can archive-and-replace at cap). Archive-then-insert
        //    inside this one transaction is load-bearing for the partial
        //    unique index chat_threads_spec_active_uq (one live manage
        //    thread per brief): the old row leaves 'active' before the new
        //    bound row enters it. The UI removes "Start over" on manage
        //    threads; this is the server-side hardening for stale clients
        //    and direct tRPC calls.
        const [created] = await tx
          .insert(chatThreads)
          .values({
            userId: ctx.user.id,
            purpose: owned[0]!.purpose,
            status: "active",
            specId: owned[0]!.specId ?? null,
            // draftSpec defaults to NULL — guaranteed clean slate.
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create replacement thread on reset",
          });
        }
        return { ok: true as const, newThreadId: created.id };
      });
    }),

  /**
   * T-415 / CAD-75: Live read of the thread's working draft for the sidebar.
   * Returns null when no draft has been written yet (fresh thread or
   * post-reset).
   */
  getDraft: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({ draftSpec: chatThreads.draftSpec })
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return rows[0].draftSpec ?? null;
    }),

  /**
   * Mark a thread completed. Called by the client after the agent has
   * successfully run `confirm_and_save` so subsequent /chat visits open
   * a fresh thread instead of reviving a terminal one.
   */
  completeThread: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db
        .update(chatThreads)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return updated;
    }),

  /**
   * Server-side helper for /api/chat: append a single message row to a
   * thread the caller has already auth-checked. Not exposed publicly to
   * keep the streaming route in charge of message shape; we expose it
   * via tRPC for testability and so the eval harness can write turns
   * deterministically.
   */
  appendMessage: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        role: z.enum(["user", "assistant", "tool"]),
        content: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await db
        .select({ id: chatThreads.id })
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.id, input.threadId),
            eq(chatThreads.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!owned[0]) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const [inserted] = await db
        .insert(chatMessages)
        .values({
          threadId: input.threadId,
          role: input.role,
          content: input.content as object,
        })
        .returning();

      if (!inserted) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to append message",
        });
      }
      return inserted;
    }),
});
