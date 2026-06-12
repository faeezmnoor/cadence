import { redirect } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { isAdminEmail } from "@/server/auth/admin";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads } from "@/server/db/schema";
import { ChatClient } from "@/components/chat/chat-client";
import { DIGEST_TEMPLATES } from "@/lib/digest-spec/templates";
import type { PersistedMessage } from "@/components/chat/types";
import { AppNav } from "@/components/nav/app-nav";

/**
 * /chat — server component. Auth-checks, resolves or creates an active
 * thread, hydrates prior messages, then mounts the streaming client.
 *
 * Resume-on-reload (T-108) is implemented here: we pick the most recent
 * active thread of purpose=initial_config, or create one. Messages are
 * fetched server-side so the client renders with content already painted.
 */
export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string }>;
}) {
  // PR 3: /chat?template=<id> deep-link (landing-page ICP stripes).
  // Server-validated: must be a known AND visible catalog row — retired or
  // internal ids fall through to the normal blank chat, never an error.
  const params = (await searchParams) ?? {};
  const rawTemplate = typeof params.template === "string" ? params.template : null;
  const deepLinkTemplate = DIGEST_TEMPLATES.find(
    (t) => t.id === rawTemplate && t.visible
  );

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

  // Find or create an active thread.
  let thread = (
    await db
      .select()
      .from(chatThreads)
      .where(
        and(
          eq(chatThreads.userId, user.id),
          eq(chatThreads.purpose, "initial_config"),
          eq(chatThreads.status, "active")
        )
      )
      .orderBy(desc(chatThreads.createdAt))
      .limit(1)
  )[0];

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
      {/*
        key={thread.id} is load-bearing for the Reset flow (multi-brief
        techdesign §7). chat.resetThread archives the current thread and
        returns a brand-new thread id; the parent /chat/page.tsx then
        re-runs and picks up the new thread. Without `key`, React would
        diff the same ChatClient instance and the Vercel AI SDK's
        `useChat` hook (keyed on threadId) would survive — carrying the
        prior `messages` array into the next request and contaminating
        the supposedly-fresh capture session.
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
