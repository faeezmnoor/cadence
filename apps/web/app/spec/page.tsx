import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { db } from "@/server/db/client";
import { digestSpecs } from "@/server/db/schema";
import { SpecClient } from "./spec-client";
import { AppNav } from "@/components/nav/app-nav";
import { isProTierAlphaEnabled } from "@/server/ai/providers";

export const dynamic = "force-dynamic";

export default async function SpecPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const currentRows = await db
    .select()
    .from(digestSpecs)
    .where(and(eq(digestSpecs.userId, user.id), eq(digestSpecs.isCurrent, true)))
    .limit(1);
  const current = currentRows[0] ?? null;

  const versions = await db
    .select({
      id: digestSpecs.id,
      version: digestSpecs.version,
      isCurrent: digestSpecs.isCurrent,
      createdVia: digestSpecs.createdVia,
      createdAt: digestSpecs.createdAt,
    })
    .from(digestSpecs)
    .where(eq(digestSpecs.userId, user.id))
    .orderBy(desc(digestSpecs.version));

  return (
    <div className="min-h-screen bg-background">
      <AppNav active="spec" />
      <SpecClient
        initialCurrent={current}
        initialVersions={versions}
        proTierAlphaEnabled={isProTierAlphaEnabled()}
      />
    </div>
  );
}
