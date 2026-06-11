/**
 * Landing-page ICP stripes — brief-creation revamp PR 3 (founder decision
 * §8.4: expose template deep-links at launch, three stripes only).
 *
 * One stripe per anchor-ICP starter brief, sourced from the same catalog
 * the app renders (STARTER_TEMPLATES) so marketing can never promise a
 * brief the chat doesn't offer. Each links to /chat?template=<id>: the
 * visitor lands in a chat already seeded with that brief instead of a
 * blank canvas (signed-out visitors round-trip through sign-in via
 * `next`).
 *
 * Copy rules: these are text-link cards, NOT buttons — the page keeps its
 * single CTA ("Start your first brief", COPY_GUIDE §8). Card copy comes
 * verbatim from the catalog (channel-free, banned-words-checked by
 * test/template-catalog.test.ts).
 */
import {
  STARTER_TEMPLATES,
  formatCadenceHint,
} from "@/lib/digest-spec/templates";

export function IcpStripes() {
  return (
    <section aria-label="Briefs Cadence runs today" className="mx-auto w-full max-w-2xl">
      <h2 className="text-center text-sm font-medium text-muted-foreground">
        Or start from a brief Cadence already runs
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STARTER_TEMPLATES.map((tpl) => {
          const cadenceHint = formatCadenceHint(tpl.seedHints?.cadence);
          return (
            <li key={tpl.id}>
              <a
                href={`/chat?template=${tpl.id}`}
                data-testid="icp-stripe"
                data-template-id={tpl.id}
                className="flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-4 transition hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
              >
                <span className="flex items-baseline gap-2">
                  <span aria-hidden="true">{tpl.emoji}</span>
                  <span className="text-sm font-medium text-foreground">
                    {tpl.label}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {tpl.description}
                </span>
                {cadenceHint && (
                  <span className="mt-auto pt-1 text-[11px] text-muted-foreground/80">
                    {cadenceHint}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
