/**
 * /auth/callback PKCE code exchange — happy + error paths.
 *
 * The route is a thin adapter around `supabase.auth.exchangeCodeForSession`.
 * We mock the Supabase server client so the test doesn't need real cookies
 * or network. The behaviours we lock in:
 *   - missing `code` -> redirects to /auth/error
 *   - exchange success -> redirects to ?next (defaults to /app)
 *   - exchange error -> redirects to /auth/error (no session leaked)
 *   - custom `next` query param is respected on success
 *
 * Why this matters: PKCE is the auth glue. Silent regressions here would
 * brick first-time sign-in for every commodity-SME we onboard, and the
 * symptom would be "I clicked the magic link and got an error page" —
 * exactly the kind of bug that kills validation conversions.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeMock = vi.fn();

vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  })),
}));

// Import AFTER the mock so the route handler picks up the mocked module.
const { GET } = await import("@/app/auth/callback/route");

afterEach(() => {
  exchangeMock.mockReset();
});

function makeReq(url: string): NextRequest {
  // NextRequest needs a full URL; cookies/headers default to empty.
  return new NextRequest(new Request(url));
}

describe("/auth/callback", () => {
  it("redirects to /auth/error when `code` is missing", async () => {
    const res = await GET(makeReq("https://app.example.com/auth/callback"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/auth/error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("exchanges code and redirects to /app on success", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });
    const res = await GET(
      makeReq("https://app.example.com/auth/callback?code=pkce_abc123")
    );
    expect(exchangeMock).toHaveBeenCalledWith("pkce_abc123");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/app");
  });

  it("honours the `next` query param on success", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });
    const res = await GET(
      makeReq("https://app.example.com/auth/callback?code=pkce_abc123&next=/spec")
    );
    expect(res.headers.get("location")).toBe("https://app.example.com/spec");
  });

  it("redirects to /auth/error when exchange fails", async () => {
    exchangeMock.mockResolvedValueOnce({
      error: { message: "code expired", status: 400 },
    });
    const res = await GET(
      makeReq("https://app.example.com/auth/callback?code=pkce_expired")
    );
    expect(exchangeMock).toHaveBeenCalledWith("pkce_expired");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/auth/error");
  });
});
