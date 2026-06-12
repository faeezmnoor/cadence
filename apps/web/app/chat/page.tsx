import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads, digestSpecs, users } from "@/server/db/schema";
import { ChatClient } from "@/components/chat/chat-client";
import { DIGEST_TEMPLATES } from "@/lib/digest-spec/templates";
import type { PersistedMessage } from "@/components/chat/types";
import { AppNav } from "@/components/nav/app-nav";
import { TimezoneGuard } from "@/components/settings/timezone-guard";
import { isManageMode } from "@/lib/feature-flags";
import { ensureManageThread } from "@/server/chat/manage-thread";
import { log } from "@/lib/log";

/**
 * /chat — server component. Auth-checks, resolves or creates a thread,
 * hydrates prior messages, then mounts the streaming client.
 *
 * Resolution order (manage-mode plan §4.2):
 *   1. ?brief=<id>  — manage entry. Flag off / unknown / unowned / archived
 *      → redirect /briefs (C4). Otherwise open the bound active thread or
 *      lazy-create + seed one (ensureManageThread, AC7.2).
 *   2. ?new=1       — "New brief": reuse a zero-message active setup thread
 *      (refresh-spam guard) else insert a fresh initial_config thread.
 *   3. ?template=   — deep-link flow, untouched: always lands on a setup
 *      thread (never a manage thread).
 *   4. bare /chat   — flag ON: most-recently-active thread, ANY purpose,
 *      by updatedAt (manage threads included). Flag OFF: legacy behavior,
 *      byte-equivalent for unbound threads, and spec-bound threads are
 *      invisible to resolution entirely (exec RC5 fail-closed).
 */
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string; brief?: string; new?: string }>;
}) {
  // PR 3: /chat?template=<id> deep-link (landing-page ICP stripes).
  // Server-validated: must be a known AND visible catalog row — retired or
  // internal ids fall through to the normal blank chat, never an error.
  const params = (await searchParams) ?? {};
  const rawTemplate = typeof params.template === "string" ? params.template : null;
  const deepLinkTemplate = DIGEST_TEMPLATES.find(
    (t) => t.id === rawTemplate && t.visible
  );
  const briefParam = typeof params.brief === "string" ? params.brief : null;
  const wantsNew = params.new === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Preserve the deep-link through the auth wall: sign-in forwards
    // `next` to /auth/callback, which redirects back here post-OAuth.
    redirect(
      deepLinkTemplate
        ? `/auth/sign-in?next=${encodeURIComponent(`/chat?template=${deepLinkTemplate.id}`)}`
        : "/auth/sign-in"
    );
  }

  // CPO HIGH-1: timezone-guard inputs (the zero-brief silent capture and
  // the with-briefs suggest banner must live where users actually land —
  // /chat is the first authed page — not just on /settings).
  const [tzUserRows, tzBriefRows] = await Promise.all([
    db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    db
      .select({ id: digestSpecs.id })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.userId, user.id),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      ),
  ]);
  const savedTimezone = tzUserRows[0]?.timezone ?? "Asia/Kuala_Lumpur";
  const hasBriefs = tzBriefRows.length > 0;

  const manageOn = isManageMode();
  let thread: typeof chatThreads.$inferSelect | undefined;

  if (briefParam) {
    // Manage entry. Flag off ⇒ spec-bound threads are unreachable (exec
    // RC5); unknown/unowned/archived/malformed ids ⇒ /briefs (C4/AC4.4).
    // All queries go through the service-role Drizzle client, so the
    // explicit userId filter IS the authorization check.
    if (!manageOn || !UUID_RE.test(briefParam)) {
      redirect("/briefs");
    }
    const specRows = await db
      .select({
        id: digestSpecs.id,
        spec: digestSpecs.spec,
        scheduling: digestSpecs.scheduling,
      })
      .from(digestSpecs)
      .where(
        and(
          eq(digestSpecs.id, briefParam),
          eq(digestSpecs.userId, user.id),
          inArray(digestSpecs.status, ["active", "paused"])
        )
      )
      .limit(1);
    const spec = specRows[0];
    if (!spec) {
      redirect("/briefs");
    }
    const ensured = await ensureManageThread({ userId: user.id, spec });
    thread = ensured.thread;
    // ACX.5 analytics: resuming (or lazily creating) a brief's chat.
    log.info("manage_thread_resumed", {
      userId: user.id,
      threadId: ensured.thread.id,
      specId: spec.id,
      source: ensured.created ? "lazy_created" : "briefs_card",
    });
  } else if (wantsNew) {
    // "New brief" (AC9.1): always lands on a FRESH setup thread. Reuse an
    // existing zero-message active setup thread (refresh-spam guard), else
    // insert. Manage threads untouched — mid-setup and manage coexist.
    const candidates = await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.userId, user.id),
          eq(chatThreads.purpose, "initial_config"),
          eq(chatThreads.status, "active"),
          isNull(chatThreads.specId)
        )
      )
      .orderBy(desc(chatThreads.createdAt))
      .limit(1);
    const candidate = candidates[0];
    if (candidate) {
      const anyMessage = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, candidate.id),
            isNull(chatMessages.archivedAt)
          )
        )
        .limit(1);
      if (anyMessage.length === 0) {
        thread = candidate;
      }
    }
    if (!thread) {
      const [inserted] = await db
        .insert(chatThreads)
        .values({
          userId: user.id,
          purpose: "initial_config",
          status: "active",
        })
        .returning();
      thread = inserted;
    }
  } else if (deepLinkTemplate || !manageOn) {
    // ?template= flow untouched (always a setup thread), and the legacy
    // bare-/chat resolution under flag-off. isNull(specId) keeps spec-bound
    // threads invisible here (RC5) — byte-equivalent to legacy for unbound
    // threads, which all have specId NULL.
    thread = (
      await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, user.id),
            eq(chatThreads.purpose, "initial_config"),
            eq(chatThreads.status, "active"),
            isNull(chatThreads.specId)
          )
        )
        .orderBy(desc(chatThreads.createdAt))
        .limit(1)
    )[0];
  } else {
    // Bare /chat, flag on (AC4.3): resume the most-recently-active thread,
    // ANY purpose — manage threads included — ordered by updatedAt (touched
    // per turn and on user-message insert, so this is true recency).
    thread = (
      await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.userId, user.id),
            eq(chatThreads.status, "active")
          )
        )
        .orderBy(desc(chatThreads.updatedAt))
        .limit(1)
    )[0];
    if (thread?.specId) {
      // ACX.5 analytics: bare /chat resumed a manage thread.
      log.info("manage_thread_resumed", {
        userId: user.id,
        threadId: thread.id,
        specId: thread.specId,
        source: "bare_chat",
      });
    }
  }

  if (!thread) {
    const [inserted] = await db
      .insert(chatThreads)
      .values({
        userId: user.id,
        purpose: "initial_config",
        status: "active",
      })
      .returning();
    thread = inserted;
  }

  if (!thread) {
    throw new Error("Failed to resolve chat thread");
  }

  const priorRows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.threadId, thread.id),
        isNull(chatMessages.archivedAt)
      )
    )
    .orderBy(asc(chatMessages.createdAt));

  const initialMessages: PersistedMessage[] = priorRows.map((r) => ({
    id: r.id,
    role: r.role as PersistedMessage["role"],
    content: r.content as PersistedMessage["content"],
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <AppNav active="chat" isAdmin={isAdminEmail(user.email)} />
      {/* CPO HIGH-1: zero-height when timezone is consistent. */}
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <TimezoneGuard
          savedTimezone={savedTimezone}
          hasBriefs={hasBriefs}
          bannerClassName="my-4"
        />
      </div>
      {/*
        key={thread.id} is load-bearing for the Reset flow (multi-brief
        techdesign §7) AND for SPA navigation between manage threads
        (/chat?brief=A → /chat?brief=B must remount with no stale message
        bleed). chat.resetThread archives the current thread and returns a
        brand-new thread id; the parent /chat/page.tsx then re-runs and
        picks up the new thread. Without `key`, React would diff the same
        ChatClient instance and the Vercel AI SDK's `useChat` hook (keyed
        on threadId) would survive — carrying the prior `messages` array
        into the next request and contaminating the supposedly-fresh
        capture session.

        Manage-mode chunk C wiring: ChatClient additionally receives mode,
        bound spec name/status, the saved spec (specDiff baseline) and
        initialSavedSpecId={thread.specId} (precedence over stale
        confirm_and_save tool results — exec advisory 12).
      */}
      <ChatClient
        key={thread.id}
        threadId={thread.id}
        initialMessages={initialMessages}
        initialDraft={(thread.draftSpec as Record<string, unknown> | null) ?? null}
        sessionEmail={user.email ?? null}
        initialTemplateId={deepLinkTemplate?.id ?? null}
      />
    </div>
  );
}
