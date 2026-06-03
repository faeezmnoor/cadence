/**
 * Local-only smoke test endpoint for the digest pipeline.
 *
 * Hits it directly to drive end-to-end without UI / magic-link auth.
 * Gated by NODE_ENV !== "production" — refuses to run in any prod build,
 * regardless of NEXT_PUBLIC_APP_URL. Belt-and-braces: also requires the
 * request host to be localhost / 127.0.0.1. NOT for production.
 *
 *   GET /api/dev-smoke?secret=<TELEGRAM_WEBHOOK_SECRET>
 *
 * (Reuses the webhook secret env var to avoid introducing a second one.)
 *
 * Security MEDIUM #1: previously gated by NEXT_PUBLIC_APP_URL.includes("localhost");
 * a misconfigured preview env containing "localhost" anywhere in that var would
 * have exposed a service-role-using user creator in prod. Hard NODE_ENV gate now.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runDigestPipeline } from "@/server/digest/run";

const TEST_EMAIL = "cadence-smoke@example.test";

export async function GET(req: Request): Promise<Response> {
  // Hard prod gate — must come first, before any env reads.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  // Belt-and-braces: also require the request host to be a localhost address.
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0] ?? "";
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0";
  if (!isLocalHost) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? "";
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Resolve-or-create test user
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  let userId: string;
  const existing = list?.users.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({ email: TEST_EMAIL, email_confirm: true });
    if (error || !created.user) return NextResponse.json({ step: "createUser", error: error?.message }, { status: 500 });
    userId = created.user.id;
  }

  // 2. Seed DigestSpec
  const seedSpec = {
    schema_version: 1,
    topics: ["live commerce on TikTok Shop", "AI agent UX patterns"],
    entities: { companies: ["TikTok Shop", "Whatnot"], tickers: [], commodities: [] },
    keywords_include: [],
    keywords_exclude: [],
    data_addons: { show_prices: false, show_24h_change: true, show_7d_change: false, fx_pairs: [] },
    rss_feeds: [],
    cadence: { frequency: "daily", delivery_time_local: "08:00", days_of_week: [1, 2, 3, 4, 5] },
    tone_preset: "executive_brief",
    length_target: "short",
    language: "en",
  };

  await admin.from("digest_specs").update({ is_current: false }).eq("user_id", userId).eq("is_current", true);
  const { data: maxRow } = await admin
    .from("digest_specs")
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (maxRow?.version ?? 0) + 1;
  const { data: inserted, error: insErr } = await admin
    .from("digest_specs")
    .insert({ user_id: userId, version: nextVersion, is_current: true, created_via: "manual_edit", spec: seedSpec })
    .select("id, version")
    .single();
  if (insErr || !inserted) return NextResponse.json({ step: "insertSpec", error: insErr?.message }, { status: 500 });

  // 3. Drive pipeline (dryRun — no Telegram)
  const t0 = Date.now();
  const result = await runDigestPipeline({ userId, dryRun: true, tolerateSourceFailures: true });
  const elapsedMs = Date.now() - t0;

  return NextResponse.json({
    userId,
    specVersion: inserted.version,
    pipeline: {
      status: result.status,
      elapsedMs,
      markdownChars: result.markdown?.length ?? 0,
      digestRunId: result.digestRunId,
      error: result.error,
    },
    markdown: result.markdown,
  });
}
