/**
 * /spec — legacy route. Permanent redirect to /briefs (the multi-brief list).
 *
 * Wave 6 / Bug 13: the version-history + raw-JSON editor moved into the
 * per-brief detail page at /briefs/[id] under the Advanced tab. /spec no
 * longer serves UI; we keep a 307 redirect so old bookmarks and /admin/runs
 * historical links don't 404.
 *
 * NOTE: the spec-client + spec-client tests have been intentionally removed.
 * If you find anything pointing at /spec from new code, link /briefs (or
 * /briefs/[id]) instead.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SpecPage() {
  redirect("/briefs" as never);
}
