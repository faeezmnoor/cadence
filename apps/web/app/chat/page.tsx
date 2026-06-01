import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { db } from "@/server/db/client";
import { chatMessages, chatThreads } from "@/server/db/schema";
import { ChatClient } from "@/components/chat/chat-client";
import type { PersistedMessage } from "@/components/chat/types";

/**
 * /chat — server component. Auth-checks, resolves or creates an active
 * thread, hydrates prior messages, then mounts the streaming client.
 *
 * Resume-on-reload (T-108) is implemented here: we pick the most recent
 * active thread of purpose=initial_config, or create one. Messages are
 * fetched server-side so the client renders with content already painted.
 */
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

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
    .where(eq(chatMessages.threadId, thread.id))
    .orderBy(asc(chatMessages.createdAt));

  const initialMessages: PersistedMessage[] = priorRows.map((r) => ({
    id: r.id,
    role: r.role as PersistedMessage["role"],
    content: r.content as PersistedMessage["content"],
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <ChatClient threadId={thread.id} initialMessages={initialMessages} />
  );
}
