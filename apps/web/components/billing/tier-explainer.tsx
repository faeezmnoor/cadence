/**
 * CAD-95 + CAD-96 (CAD-202 rewrite) — research-depth explainer copy,
 * single source of truth.
 *
 * Renders the canonical "what's the difference between standard and
 * advanced research?" copy used in three places:
 *   - /settings/billing   (collapsible disclosure under the pack tiles)
 *   - /briefs/[id]        (tooltip on the research-depth toggle, alpha cohort only)
 *   - /pricing            (research-depth section near the bottom)
 *
 * Why a shared component rather than three near-identical copy blocks:
 * positioning has to stay consistent across surfaces (memory:
 * feedback_cadence_positioning + project_cadence_no_tier_plans). Cadence
 * does not ship a separate paid plan for advanced research; research
 * depth is a per-brief configuration toggle that consumes more credits.
 *
 * Variants:
 *   - "full"     — heading + both research-depth blurbs + footer-marker note.
 *                  Used on /pricing and inside the billing disclosure.
 *   - "compact"  — short two-line summary. Used inside the brief-detail tooltip
 *                  where vertical space is tight.
 *
 * Server component — no client interactivity needed.
 */
import * as React from "react";

interface TierExplainerProps {
  variant?: "full" | "compact";
  className?: string;
}

export function TierExplainer({
  variant = "full",
  className,
}: TierExplainerProps) {
  if (variant === "compact") {
    return (
      <div
        className={
          "space-y-1.5 text-xs leading-relaxed text-muted-foreground" +
          (className ? ` ${className}` : "")
        }
      >
        <p>
          <span className="font-medium text-foreground">Standard research · 1 credit</span>{" "}
          — generic web search + a fast composer. Smart enough for most briefs.
        </p>
        <p>
          <span className="font-medium text-foreground">🔬 Advanced research · 3 credits</span>{" "}
          — Perplexity Sonar Reasoning Pro + Claude Sonnet 4.6. Deeper research,
          sharper insights.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        "space-y-4 text-sm leading-relaxed text-foreground" +
        (className ? ` ${className}` : "")
      }
    >
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold">Standard research · 1 credit per brief</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Smart enough for most briefs. Generic web search plus a fast,
          lightweight composer. The everyday default.
        </p>
      </div>

      <div className="rounded-lg border border-brand/40 bg-brand/5 p-4">
        <p className="text-sm font-semibold">
          🔬 Advanced research · 3 credits per brief
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Deeper research, sharper insights. Perplexity Sonar Reasoning Pro
          performs LLM-driven web research; Claude Sonnet 4.6 composes a
          tighter narrative with stronger second-order analysis. Best for
          high-signal topics where a generic summary won&apos;t cut it.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Advanced briefs include a 🔬 footer marker on delivery, so you always
        know which research mode you got.
      </p>
    </div>
  );
}
