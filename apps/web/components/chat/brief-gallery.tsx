"use client";

/**
 * "Browse all briefs" — brief-creation revamp PR 3 (proposal §3).
 *
 * One catalog, two containers:
 *  - Desktop (lg+): a reversible INLINE disclosure that takes the starter
 *    cards' place in the welcome block. Collapsing restores the three
 *    starters — never a destructive swap, never a centered modal.
 *  - Mobile (<lg): a bottom sheet at ~85vh. Close button + overlay tap to
 *    dismiss. NO drag gestures in v1 (engineer ruling: the sheet container
 *    without the gesture half).
 *
 * Cards are the same TemplateCard component as the turn-0 starters — the
 * starters are visibly a preview of this catalog, not a different species.
 * Header copy is UX-writer canon: "Briefs I can run for you" (never
 * Templates/Gallery/Library/Catalog). Sections come from
 * groupedVisibleTemplates() — an empty section is a removed section.
 */
import {
  groupedVisibleTemplates,
  type DigestTemplate,
} from "@/lib/digest-spec/templates";
import { TemplateCard } from "./starter-cards";

const GALLERY_HEADER = "Briefs I can run for you";

function GalleryContent({
  onSelect,
  onClose,
  disabled,
  closeLabel,
}: {
  onSelect: (template: DigestTemplate) => void;
  onClose: () => void;
  disabled?: boolean;
  closeLabel: string;
}) {
  const sections = groupedVisibleTemplates();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {GALLERY_HEADER}
        </h2>
        <button
          type="button"
          data-testid="brief-gallery-close"
          onClick={onClose}
          className="text-xs font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          {closeLabel}
        </button>
      </div>
      {sections.map((section) => (
        <section key={section.category} aria-label={section.label}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {section.label}
          </h3>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {section.templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onSelect={onSelect}
                disabled={disabled}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BriefGallery({
  open,
  onClose,
  onSelect,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (template: DigestTemplate) => void;
  disabled?: boolean;
}) {
  if (!open) return null;
  return (
    <>
      {/* Desktop: inline disclosure in the welcome block. */}
      <div data-testid="brief-gallery-inline" className="hidden lg:block">
        <GalleryContent
          onSelect={onSelect}
          onClose={onClose}
          disabled={disabled}
          closeLabel="Show less"
        />
      </div>
      {/* Mobile: bottom sheet, ~85vh, overlay tap or Close to dismiss. */}
      <div
        data-testid="brief-gallery-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={GALLERY_HEADER}
        className="fixed inset-0 z-50 lg:hidden"
      >
        <div
          aria-hidden="true"
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background px-4 pb-6 pt-4">
          <GalleryContent
            onSelect={onSelect}
            onClose={onClose}
            disabled={disabled}
            closeLabel="Close"
          />
        </div>
      </div>
    </>
  );
}
