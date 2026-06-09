"use client";

import { useState } from "react";

/**
 * Monospace code block with a copy button.
 *
 * Blueprint §2.5. No syntax highlighting in v1 — keeps bundle size flat
 * (Shiki/Prism would tack on >150kB gz). Language label only when the
 * fenced block declared one (` ```json ` etc.).
 */
export function CodeBlock({
  language,
  code,
}: {
  language?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts; silently no-op.
    }
  };

  return (
    <div
      role="region"
      aria-label={
        language ? `Code block (${language})` : "Code block"
      }
      className="my-2 overflow-hidden rounded-md border border-border bg-muted/40"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{language ?? "code"}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-[0.85em] leading-snug">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
