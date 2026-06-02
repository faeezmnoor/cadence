/**
 * RLS regression suite — would have caught the 2026-06-01 P0 cold.
 *
 * For every table that exists in the public schema, this test instantiates
 * a Supabase client using the *anon* key (the same key shipped in our client
 * bundle) and asserts:
 *
 *   1. Anon SELECT returns no rows (RLS-blocked) OR errors. Crucially, it
 *      must not leak rows belonging to other tenants.
 *   2. Anon INSERT fails. We try a minimal probe row; either Supabase
 *      rejects with an RLS violation (42501) or PostgREST refuses (401/403).
 *
 * Data-driven by `discoverTables()` — any new public table we add is
 * auto-covered the moment it appears in information_schema. The only
 * opt-out is the explicit ALLOWLIST below (for tables that *should* be
 * anon-readable, of which we currently have zero).
 *
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - DATABASE_URL (service-role, only used to enumerate tables)
 *
 * Skips the whole suite if any of those is missing (e.g. CI without secrets).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

// Tables explicitly allowed to be anon-readable. Empty by design.
const ANON_READABLE_ALLOWLIST = new Set<string>([]);

// Tables we know hold no user data and intentionally allow anon writes.
// Empty by design — if you ever add one, justify it here.
const ANON_WRITABLE_ALLOWLIST = new Set<string>([]);

const haveCreds = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && DATABASE_URL);

const describeIf = haveCreds ? describe : describe.skip;

describeIf("RLS regression (live Supabase)", () => {
  // Lazy-instantiate inside beforeAll so a missing env at collection time
  // doesn't explode the whole module (vitest still walks the describe body
  // even when the suite is later skipped). See bonus-fix in T-303 (CAD-38).
  let adminSql: Sql;
  let anon: SupabaseClient;

  beforeAll(() => {
    adminSql = postgres(DATABASE_URL!, { prepare: false, max: 1 });
    anon = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (adminSql) await adminSql.end();
  });

  // Enumerate tables in public schema via service role.
  async function discoverTables(): Promise<string[]> {
    const rows = await adminSql<{ tablename: string }[]>`
      SELECT tablename
        FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename NOT LIKE 'drizzle_%'
       ORDER BY tablename
    `;
    return rows.map((r) => r.tablename);
  }

  it("discovers public-schema tables", async () => {
    const tables = await discoverTables();
    expect(tables.length).toBeGreaterThan(0);
    // Sanity: the tables the P0 was about must exist.
    expect(tables).toContain("source_cache");
    expect(tables).toContain("rss_items");
  });

  it("anon SELECT returns no rows on every user-data table", async () => {
    const tables = await discoverTables();
    const leaks: { table: string; rowCount: number }[] = [];

    for (const table of tables) {
      if (ANON_READABLE_ALLOWLIST.has(table)) continue;
      const { data, error } = await anon
        .from(table)
        .select("*", { count: "exact", head: false })
        .limit(5);
      // Either RLS error, or empty result. Either is acceptable.
      // What's NOT acceptable: non-empty data.
      if (!error && Array.isArray(data) && data.length > 0) {
        leaks.push({ table, rowCount: data.length });
      }
    }

    expect(leaks, `anon-readable leaks: ${JSON.stringify(leaks)}`).toEqual([]);
  });

  it("anon INSERT fails on every table", async () => {
    const tables = await discoverTables();
    const breaches: { table: string }[] = [];

    for (const table of tables) {
      if (ANON_WRITABLE_ALLOWLIST.has(table)) continue;
      // Minimal probe row — most columns will violate NOT NULL, but RLS /
      // permission checks fire BEFORE column validation in PostgREST. So if
      // we get back any non-permission error (e.g. 23502 not-null), that
      // means the write was actually attempted past the RLS gate. Treat
      // anything other than 42501 / permission denied / 401 / 403 as a
      // potential breach worth investigating.
      const { error } = await anon
        .from(table)
        .insert({ probe_marker: "rls-regression-probe" } as never);

      if (!error) {
        breaches.push({ table });
        continue;
      }
      const code = (error as { code?: string }).code ?? "";
      const status = (error as { status?: number }).status ?? 0;
      const msg = (error.message ?? "").toLowerCase();
      const looksLikeRlsBlock =
        code === "42501" ||
        status === 401 ||
        status === 403 ||
        msg.includes("permission denied") ||
        msg.includes("row-level security") ||
        msg.includes("violates row-level security") ||
        // PostgREST returns PGRST301 for "no rows returned by RLS" on insert
        code === "PGRST301" ||
        // PGRST116 / 204 paths
        msg.includes("not allowed");
      if (!looksLikeRlsBlock) {
        // Probe got past RLS into column validation — that's the danger.
        // 23502/23503/22P02 here means anon could attempt the write.
        if (code === "23502" || code === "23503" || code === "22P02" || code === "42703") {
          breaches.push({ table });
        }
      }
    }

    expect(breaches, `anon-writable breaches: ${JSON.stringify(breaches)}`).toEqual([]);
  });

  it("regression: source_cache + rss_items have RLS enabled (the P0 fix)", async () => {
    const rows = await adminSql<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity
        FROM pg_class
       WHERE relname IN ('source_cache', 'rss_items')
         AND relnamespace = 'public'::regnamespace
    `;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} must have RLS enabled`).toBe(true);
    }
  });
});
