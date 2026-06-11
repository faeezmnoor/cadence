/**
 * CAD-215 — billing.requestCredits founder ping.
 *
 * Module-boundary coverage of the new mutation: mock db, the rate-limit
 * helper, and the Telegram channel adapter (per CLAUDE.md, no test hits
 * the real Telegram API). Locks:
 *   - auth gate (protectedProcedure)
 *   - 1-per-24h rate limit → TOO_MANY_REQUESTS, no send
 *   - happy path: message format "Credit request from {email} — balance
 *     {n}. Grant via /admin." sent via the channel adapter, { sent: true }
 *   - ADMIN_TELEGRAM_CHAT_ID unset/invalid → { sent: false }, no send,
 *     warning logged (UI falls back to the support-email line)
 *   - adapter send failure → { sent: false }, mutation still succeeds
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let rateLimitAllowed = true;
const checkRateLimitMock = vi.fn(async (_opts: unknown) => ({
  allowed: rateLimitAllowed,
  count: rateLimitAllowed ? 1 : 2,
  limit: 1,
  retryAfter: rateLimitAllowed ? 0 : 3600,
}));

vi.mock("@/server/rate-limit/check", () => ({
  checkRateLimit: (opts: unknown) => checkRateLimitMock(opts as never),
}));

let balanceRows: Array<{ creditsBalance: number }> = [{ creditsBalance: 2 }];

vi.mock("@/server/db/client", () => ({
  db: {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => balanceRows,
                orderBy() {
                  return { limit: async () => [] };
                },
              };
            },
          };
        },
      };
    },
  },
}));

const sendMock = vi.fn(async (_part: unknown, _target: unknown) => ({
  messageId: 1,
}));
let telegramConfigured = true;

vi.mock("@/server/channels/telegram", () => ({
  telegramAdapter: {
    channel: "telegram",
    send: (part: unknown, target: unknown) => sendMock(part as never, target as never),
  },
  formatPlainText: (text: string) => [{ text }],
  isTelegramConfigured: () => telegramConfigured,
}));

const warnMock = vi.fn();
vi.mock("@/lib/log", () => ({
  log: { warn: (...args: unknown[]) => warnMock(...args) },
}));

import { billingRouter } from "@/server/trpc/routers/billing";

function makeCtx(email = "hafiz@example.com") {
  return {
    user: { id: "00000000-0000-4000-8000-000000000001", email },
    supabase: null,
  } as never;
}

beforeEach(() => {
  rateLimitAllowed = true;
  telegramConfigured = true;
  balanceRows = [{ creditsBalance: 2 }];
  process.env.ADMIN_TELEGRAM_CHAT_ID = "123456789";
  checkRateLimitMock.mockClear();
  sendMock.mockClear();
  warnMock.mockClear();
});

afterEach(() => {
  delete process.env.ADMIN_TELEGRAM_CHAT_ID;
});

describe("billing.requestCredits (CAD-215)", () => {
  it("rejects signed-out callers", async () => {
    const caller = billingRouter.createCaller({ user: null, supabase: null } as never);
    await expect(caller.requestCredits()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the founder ping with email + balance and returns sent=true", async () => {
    const caller = billingRouter.createCaller(makeCtx());
    const result = await caller.requestCredits();
    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [part, target] = sendMock.mock.calls[0] as unknown as [
      { text: string },
      { channel: string; chatId: number },
    ];
    expect(part.text).toBe(
      "Credit request from hafiz@example.com — balance 2. Grant via /admin."
    );
    expect(target).toEqual({ channel: "telegram", chatId: 123456789 });
  });

  it("rate-limits to 1 request per 24h with TOO_MANY_REQUESTS and no send", async () => {
    rateLimitAllowed = false;
    const caller = billingRouter.createCaller(makeCtx());
    await expect(caller.requestCredits()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(sendMock).not.toHaveBeenCalled();
    // The window is the 24h fixed window on the shared rate_limits table.
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "credit_request",
        limit: 1,
        windowSeconds: 24 * 60 * 60,
      })
    );
  });

  it("returns sent=false and logs a warning when ADMIN_TELEGRAM_CHAT_ID is unset", async () => {
    delete process.env.ADMIN_TELEGRAM_CHAT_ID;
    const caller = billingRouter.createCaller(makeCtx());
    const result = await caller.requestCredits();
    expect(result).toEqual({ sent: false });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalled();
  });

  it("returns sent=false when the Telegram bot is not configured", async () => {
    telegramConfigured = false;
    const caller = billingRouter.createCaller(makeCtx());
    const result = await caller.requestCredits();
    expect(result).toEqual({ sent: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns sent=false (not an error) when the adapter send throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("telegram down"));
    const caller = billingRouter.createCaller(makeCtx());
    const result = await caller.requestCredits();
    expect(result).toEqual({ sent: false });
    expect(warnMock).toHaveBeenCalled();
  });
});
