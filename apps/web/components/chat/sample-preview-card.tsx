"use client";

/**
 * SamplePreviewCard — inline render of a dry-run sample (manage-mode plan
 * §3.2). Shown in the message list when a `send_sample` tool result
 * carries markdown ({ok: true, deliver: false, markdown}).
 *
 * - Reuses the existing <Markdown> whitelist renderer (same path as the
 *   brief-actions preview body) so B3 serif/citation styling applies where
 *   it already does.
 * - Eyebrow "Sample — not delivered" is load-bearing honesty: the user
 *   must never mistake an in-chat preview for a delivered brief. It uses
 *   the one legitimate uppercase micro-label class (COPY_GUIDE §7,
 *   exec advisory 3) — do not copy this pattern for decorative labels.
 * - Long samples scroll inside the card (max-h-96) instead of swallowing
 *   the transcript.
 * - Real sends (deliver: true) render NO card — the agent's confirmation
 *   message is the only surface (§3.2).
 */
import { Markdown } from "./markdown";

export function SamplePreviewCard({ markdown }: { markdown: string }) {
  return (
    <div
      data-testid="sample-preview-card"
      className="flex max-w-[88%] flex-col gap-2 rounded-md border border-border bg-background p-4 sm:max-w-[85%]"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Sample — not delivered
      </span>
      <div className="max-h-96 overflow-y-auto break-words text-sm leading-relaxed">
        <Markdown>{markdown}</Markdown>
      </div>
    </div>
  );
}
