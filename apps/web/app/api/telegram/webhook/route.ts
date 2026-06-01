/**
 * POST /api/telegram/webhook
 *
 * Telegram POSTs Updates here. Two layers of verification:
 *  1. `?secret=` query param matches TELEGRAM_WEBHOOK_SECRET, OR
 *  2. The `X-Telegram-Bot-Api-Secret-Token` header matches the secret
 *
 * We accept either (Telegram's setWebhook `secret_token` is the modern
 * approach; we also accept query-string for local dev curl-testing).
 *
 * Telegram REQUIRES a 2xx within ~60s. We respond 200 fast and dispatch
 * inline (grammY's bot.api.sendMessage is non-blocking enough for the MVP).
 * If latency becomes an issue we'll punt to Inngest.
 */
import { NextResponse, type NextRequest } from "next/server";
import { dispatchTelegramUpdate } from "@/server/telegram/dispatch";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  return querySecret === secret || headerSecret === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Don't leak that the secret was wrong vs missing — 401 for both.
    return new NextResponse("unauthorized", { status: 401 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  try {
    await dispatchTelegramUpdate(update as Parameters<typeof dispatchTelegramUpdate>[0]);
  } catch (err) {
    console.error("[telegram:webhook] dispatch error", err);
    // Still 200 — Telegram will retry on non-2xx, and our dispatch errors
    // are app bugs, not transient. We'd rather log + investigate than
    // get into a retry storm.
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Health check — handy for "did Vercel route this?" debugging.
  return NextResponse.json({ status: "telegram webhook ready" });
}
