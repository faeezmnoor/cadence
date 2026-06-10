/**
 * Telegram link token issuance + resolution.
 *
 * Tokens are 12-char Crockford base32 (no I/L/O/U so users can read them
 * aloud if needed) with a 15-minute TTL. Single-use: stamped consumed_at
 * once the bot processes /start <token>.
 *
 * Issuance happens in the auth'd tRPC `telegram.createLinkToken` call.
 * Resolution happens server-side from the webhook handler — never trust
 * a token coming from a non-webhook surface.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { telegramLinkTokens, users } from "@/server/db/schema";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

export const LINK_TOKEN_LENGTH = 12;
export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export function generateLinkTokenString(): string {
  const bytes = randomBytes(LINK_TOKEN_LENGTH);
  let out = "";
  for (let i = 0; i < LINK_TOKEN_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Issue a fresh link token for a user. Multiple unconsumed tokens may
 * coexist (e.g. user clicked refresh) — we never invalidate prior ones,
 * we just let them age out.
 */
export async function issueLinkToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateLinkTokenString();
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  await db.insert(telegramLinkTokens).values({
    userId,
    token,
    expiresAt,
  });
  return { token, expiresAt };
}

export type LinkResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_consumed" };

/**
 * Resolve a token presented by the Telegram bot and, if valid, atomically:
 *  - mark the token consumed
 *  - stamp users.telegram_chat_id / telegram_username
 *
 * If the chat_id is already linked to a different user, we overwrite
 * (most recent /start wins). This is a conscious choice — if a user
 * re-links from a fresh browser session they expect it to work.
 */
export async function resolveAndLinkToken(args: {
  token: string;
  telegramChatId: number;
  telegramUsername: string | null;
}): Promise<LinkResolution> {
  const { token, telegramChatId, telegramUsername } = args;
  const now = new Date();

  const rows = await db
    .select()
    .from(telegramLinkTokens)
    .where(eq(telegramLinkTokens.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "already_consumed" };
  if (row.expiresAt.getTime() < now.getTime())
    return { ok: false, reason: "expired" };

  await db.transaction(async (tx) => {
    // Detach the chat_id from any prior user (telegram_chat_id is UNIQUE).
    await tx
      .update(users)
      .set({ telegramChatId: null, updatedAt: now })
      .where(
        and(
          eq(users.telegramChatId, telegramChatId),
          ne(users.id, row.userId)
        )
      );

    await tx
      .update(users)
      .set({
        telegramChatId,
        telegramUsername,
        updatedAt: now,
      })
      .where(eq(users.id, row.userId));

    await tx
      .update(telegramLinkTokens)
      .set({ consumedAt: now, updatedAt: now })
      .where(eq(telegramLinkTokens.id, row.id));
  });

  return { ok: true, userId: row.userId };
}

/** Best-effort cleanup helper; not invoked anywhere yet but handy for cron. */
export async function purgeExpiredTokens(): Promise<number> {
  const res = await db
    .delete(telegramLinkTokens)
    .where(
      and(
        isNull(telegramLinkTokens.consumedAt),
        lt(telegramLinkTokens.expiresAt, new Date())
      )
    );
  return (res as unknown as { count?: number }).count ?? 0;
}
