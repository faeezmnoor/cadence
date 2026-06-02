import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Marketing route-group layout. Wraps /pricing, /how-it-works, /privacy, /terms
 * with the public nav + footer. Landing page renders nav/footer inline so the
 * hero can sit flush — that's why this layout doesn't cover `/`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <MarketingNav />
      <main className="flex-1 px-6 pb-16 pt-8 sm:px-10 sm:pt-12">{children}</main>
      <MarketingFooter />
    </div>
  );
}
