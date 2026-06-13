/**
 * CAD-226 — source-authority registry for advanced-research grounding.
 *
 * The CAD-222 bake-off scored both advanced stacks 3.2/5 on grounding,
 * and the spot-read showed why: briefs citing third-party blogs and
 * aggregators (vatupdate.com, jomeinvoice.my, tendersontime.com) where
 * official primary sources exist (hasil.gov.my, MPOB, ePerolehan). The
 * founder's quality bar for un-pausing the tier is mean grounding ≥4.0.
 *
 * This module maps the existing TOPIC_KEYWORDS buckets (sources/index.ts)
 * to the official / primary domains a brief on that bucket should prefer.
 * Consumers feed the list into research prompts as a PREFERENCE — never a
 * hard allowlist. Hard-filtering kills recall on breaking news (primary
 * sources publish slowly); preference keeps recall while pulling citations
 * toward sources a skeptical reader would trust.
 *
 * Keep entries to genuinely authoritative domains: government, central
 * banks, regulators, exchanges, statistics agencies, multilateral bodies,
 * and the national wire (Bernama). Trade press of record is allowed where
 * a vertical has no public-sector publisher. No personal blogs, no SEO
 * content farms, no vendor marketing domains.
 */
import { bucketsForSpec } from "./index";

export const AUTHORITY_DOMAINS: Record<string, readonly string[]> = {
  palm_oil: ["mpob.gov.my", "bepi.mpob.gov.my", "usda.gov", "fas.usda.gov"],
  commodities: ["usda.gov", "fao.org", "igc.int", "worldbank.org"],
  oil_gas: ["eia.gov", "iea.org", "opec.org"],
  agri: ["usda.gov", "fao.org", "dosm.gov.my", "dvs.gov.my"],
  malaysia: [
    "bnm.gov.my",
    "dosm.gov.my",
    "sc.com.my",
    "bursamalaysia.com",
    "hasil.gov.my",
    "eperolehan.gov.my",
    "mof.gov.my",
    "miti.gov.my",
    "digital.gov.my",
    "bernama.com",
  ],
  sea: ["asean.org", "mas.gov.sg", "bi.go.id", "bot.or.th", "adb.org"],
  tech: ["arxiv.org", "ietf.org", "w3.org"],
  saas: [],
  startups: ["sec.gov"],
  funding: ["sec.gov"],
  equities: ["bursamalaysia.com", "sec.gov", "sgx.com"],
  business: ["dosm.gov.my", "worldbank.org", "imf.org"],
  regulatory: ["bnm.gov.my", "sc.com.my", "sec.gov", "hasil.gov.my"],
  banking: ["bnm.gov.my", "bis.org", "mas.gov.sg"],
  crypto: ["sec.gov", "bnm.gov.my", "bis.org"],
};

/** Cap so prompt blocks stay small and cacheable-ish per spec. */
const MAX_AUTHORITY_DOMAINS = 12;

/**
 * Authoritative domains for a spec, derived from its topic buckets.
 * Order: bucket match order, de-duplicated, capped. Empty array when no
 * bucket matches — consumers must render nothing in that case (a generic
 * "prefer official sources" line still applies via the prompt rules).
 */
export function authorityDomainsForSpec(spec: {
  topics?: readonly string[];
  topicHint?: string | null;
  entities?: {
    companies?: readonly string[];
    tickers?: readonly string[];
    commodities?: readonly string[];
  };
}): string[] {
  const buckets = bucketsForSpec(spec);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bucket of buckets) {
    for (const domain of AUTHORITY_DOMAINS[bucket] ?? []) {
      if (seen.has(domain)) continue;
      seen.add(domain);
      out.push(domain);
      if (out.length >= MAX_AUTHORITY_DOMAINS) return out;
    }
  }
  return out;
}
