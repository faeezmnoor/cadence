/**
 * T-015 / CAD-59 — FK public.users.id -> auth.users.id ON DELETE CASCADE.
 *
 * Verifies migration 0010 against live Supabase:
 *   1. The constraint exists with delete_rule = CASCADE.
 *   2. Deleting an auth.users row cascades through public.users and onward
 *      through downstream FKs (digest_specs is a representative carrier:
 *      digest_specs.user_id -> public.users.id ON DELETE cascade).
 *   3. The constraint definition is idempotent — re-running the migration
 *      is a no-op once installed (smoke-checked via information_schema —
 *      the migration's own DO block handles the actual re-run guard).
 *
 * Skips the suite if Supabase service-role creds are missing (CI without
 * secrets), matching the convention used by rls-regression.test.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const haveCreds = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && DATABASE_URL);
const describeIf = haveCreds ? describe : describe.skip;

const TEST_EMAIL = `cadence-fk-cascade-${Date.now()}@example.test`;

describeIf("public.users.id -> auth.users.id FK cascade (live Supabase)", () => {
  let admin: SupabaseClient;
  let sql: Sql;

  beforeAll(() => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    sql = postgres(DATABASE_URL!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("constraint exists with ON DELETE CASCADE", async () => {
    const rows = await sql<{ constraint_name: string; delete_rule: string }[]>`
      SELECT tc.constraint_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'users'
        AND tc.constraint_name = 'users_id_auth_users_id_fk'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].delete_rule).toBe("CASCADE");
  });

  it("deleting auth.users row cascades through public.users + digest_specs", async () => {
    // 1. Create auth user → trigger from migration 0002 inserts public.users.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    expect(created.user).toBeTruthy();
    const userId = created.user!.id;

    // 2. Confirm public.users row exists (trigger ran).
    const pubBefore = await sql<{ id: string }[]>`
      SELECT id FROM public.users WHERE id = ${userId}
    `;
    expect(pubBefore).toHaveLength(1);

    // 3. Seed a digest_specs row to verify downstream cascade.
    const specInsert = await sql<{ id: string }[]>`
      INSERT INTO public.digest_specs (user_id, version, spec, is_current, created_via)
      VALUES (
        ${userId},
        1,
        ${sql.json({ schema_version: 1, smoke: true })},
        true,
        'fk-cascade-test'
      )
      RETURNING id
    `;
    expect(specInsert).toHaveLength(1);
    const specId = specInsert[0].id;

    // 4. Delete the auth.users row. This is the cascade trigger.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    expect(delErr).toBeNull();

    // 5. public.users row should be gone (FK cascade from 0010).
    const pubAfter = await sql<{ id: string }[]>`
      SELECT id FROM public.users WHERE id = ${userId}
    `;
    expect(pubAfter).toHaveLength(0);

    // 6. digest_specs row should be gone (existing FK on digest_specs.user_id
    //    -> public.users.id ON DELETE cascade, transitively triggered).
    const specAfter = await sql<{ id: string }[]>`
      SELECT id FROM public.digest_specs WHERE id = ${specId}
    `;
    expect(specAfter).toHaveLength(0);
  }, 30_000);
});
