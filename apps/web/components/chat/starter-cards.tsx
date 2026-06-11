"use client";

/**
 * Brief-creation revamp PR 1 (proposals/brief-creation-flow-proposal.md §3).
 *
 * `TemplateCard` is THE card — turn-0 starters and the PR 3 "Browse all
 * briefs" surface render the same component, so the starter cards are
 * visibly a preview of the catalog, not a different species of pill.
 *
 * Card anatomy (four mandatory slots, one optional — UX-writer vetted):
 *   emoji · name (≤4 words, ends "brief"/"watch") · value line (≤10 words)
 *   · cadence hint rendered from seedHints.cadence via formatCadenceHint()
 *   · optional example headline behind an "e.g. —" prefix (illustrative,
 *     never presented as a live fact).
 *
 * Tap = informed consent: the card auto-submits its exampleQuery as the
 * user's first message (no autofill-and-edit — that died with the pills).
 */
import {
  STARTER_TEMPLATES,
  formatCadenceHint,
  type DigestTemplate,
} from "@/lib/digest-spec/templates";

export function TemplateCard({
  template,
  onSelect,
  disabled,
}: {
  template: DigestTemplate;
  onSelect: (template: DigestTemplate) => void;
  disabled?: boolean;
}) {
  const cadenceHint = formatCadenceHint(template.seedHints?.cadence);
  return (
    <button
      type="button"
      data-testid="template-card"
      data-template-id={template.id}
      data-template-category={template.category}
      onClick={() => onSelect(template)}
      disabled={disabled}
      className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-baseline gap-2">
        <span aria-hidden="true" className="text-base leading-none">
          {template.emoji}
        </span>
        <span className="text-sm font-medium text-foreground">
          {template.label}
        </span>
        {cadenceHint && (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {cadenceHint}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {template.description}
      </span>
      {template.exampleHeadline && (
        <span className="border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground/80">
          e.g. — {template.exampleHeadline}
        </span>
      )}
    </button>
  );
}

export function StarterCards({
  onSelect,
  onDescribeOwn,
  onBrowseAll,
  disabled,
}: {
  onSelect: (template: DigestTemplate) => void;
  /** Focuses the composer input — the free-text escape hatch. */
  onDescribeOwn: () => void;
  /** PR 3: opens the "Browse all briefs" surface. Hidden until provided. */
  onBrowseAll?: () => void;
  disabled?: boolean;
}) {
  return (
    <div data-testid="chat-starter-cards" className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Or start from one of these</p>
      <div className="flex flex-col gap-2" aria-label="Starter briefs">
        {STARTER_TEMPLATES.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 pt-1">
        {onBrowseAll && (
          <button
            type="button"
            data-testid="browse-all-briefs"
            onClick={onBrowseAll}
            disabled={disabled}
            className="text-xs font-medium text-foreground underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            Browse all briefs
          </button>
        )}
        <button
          type="button"
          data-testid="describe-it-yourself"
          onClick={onDescribeOwn}
          disabled={disabled}
          className="text-xs font-medium text-foreground underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          Describe it in your words
        </button>
      </div>
    </div>
  );
}
