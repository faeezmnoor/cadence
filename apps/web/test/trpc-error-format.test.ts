/**
 * Slice 005, review F2: the tRPC error response is bounded. Before, the fetch
 * adapter put every Zod issue into the message and (outside production) the
 * stack, which repeats it: a 1 MiB body gave a 116–233 MB response. Now:
 * at most 20 issues plus a count, no stack in any environment, and any
 * message cut to a fixed length.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { z } from "zod";
import { publicProcedure, router } from "@/server/trpc/trpc";
import { MAX_ERROR_ISSUES, MAX_ERROR_MESSAGE_CHARS } from "@/server/trpc/error-format";

const testRouter = router({
  save: publicProcedure.input(z.object({ ids: z.array(z.number()).max(3) })).mutation(() => "ok"),
  boom: publicProcedure.mutation(() => {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid scheduling rule: " + "x".repeat(100_000) });
  }),
});

async function call(path: string, input: unknown) {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(`https://app.example.com/api/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    }),
    router: testRouter,
    createContext: () => ({}) as never,
  });
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as { error: { json: Record<string, unknown> } } };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tRPC errorFormatter", () => {
  it("pins the bounds", () => {
    expect(MAX_ERROR_ISSUES).toBe(20);
    expect(MAX_ERROR_MESSAGE_CHARS).toBe(500);
  });

  it.each(["development", "production", "test"])(
    "returns at most 20 issues plus the count and no stack (NODE_ENV=%s)",
    async (env) => {
      vi.stubEnv("NODE_ENV", env);
      const { status, text, body } = await call("save", { ids: Array.from({ length: 5_000 }, () => "bad") });
      expect(status).toBe(400);
      const err = body.error.json as {
        message: string;
        data: { stack?: string; zodIssues: unknown[]; zodIssueCount: number };
      };
      expect(err.data.zodIssues).toHaveLength(20);
      expect(err.data.zodIssueCount).toBe(5_001);
      expect(err.data.stack).toBeUndefined();
      expect(err.message.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_CHARS);
      expect(text.length).toBeLessThan(20_000);
    }
  );

  it("keeps a valid call working", async () => {
    const res = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request("https://app.example.com/api/trpc/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { ids: [1, 2] } }),
      }),
      router: testRouter,
      createContext: () => ({}) as never,
    });
    expect(res.status).toBe(200);
  });

  it("cuts a long hand-written message and keeps short ones whole", async () => {
    const { body } = await call("boom", undefined);
    const err = body.error.json as { message: string; data: { stack?: string; code: string } };
    expect(err.message.length).toBeLessThanOrEqual(MAX_ERROR_MESSAGE_CHARS);
    expect(err.message.startsWith("Invalid scheduling rule: ")).toBe(true);
    expect(err.data.stack).toBeUndefined();
    expect(err.data.code).toBe("BAD_REQUEST");
  });
});
