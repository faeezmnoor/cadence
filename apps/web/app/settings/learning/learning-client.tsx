"use client";

import { trpc } from "@/lib/trpc/client";
import { prettify } from "@/lib/labels";

function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(s: string) {
  if (s === "tune_command") return "/tune";
  if (s === "feedback_event") return "Reaction";
  if (s === "distilled") return "Distilled";
  return prettify(s);
}

export function LearningClient() {
  const distilled = trpc.learning.getDistilled.useQuery();
  const tunes = trpc.learning.getRecentTunes.useQuery({ limit: 5 });

  const bullets = distilled.data?.bullets ?? [];
  const recent = tunes.data ?? [];

  const empty =
    !distilled.isLoading &&
    !tunes.isLoading &&
    bullets.length === 0 &&
    recent.length === 0;

  return (
    <div className="space-y-10">
      {/* Empty state */}
      {empty && (
        <section
          data-testid="learning-empty-state"
          className="rounded-xl border border-dashed border-border bg-card p-8 text-center"
        >
          <p className="text-sm text-muted-foreground">
            I&rsquo;m still learning your preferences &mdash; give a 👍/👎 or
            send a <code>/tune ...</code> on your next brief and I&rsquo;ll
            start tracking.
          </p>
        </section>
      )}

      {/* Distilled bullets */}
      {!empty && (
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            What I&rsquo;ve learned
          </h2>
          {distilled.isLoading ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading&hellip;
            </div>
          ) : bullets.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              Nothing locked in yet. Once a week I go through your reactions
              and corrections and keep what holds steady.
            </div>
          ) : (
            <ul
              data-testid="learning-distilled-list"
              className="space-y-2 rounded-lg border border-border bg-card p-6"
            >
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span aria-hidden className="text-muted-foreground">
                    &bull;
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Recent raw tunes */}
      {!empty && (
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your recent corrections
          </h2>
          {tunes.isLoading ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading&hellip;
            </div>
          ) : recent.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              No tune commands yet.
            </div>
          ) : (
            <ul
              data-testid="learning-tunes-list"
              className="divide-y divide-border rounded-lg border border-border bg-card"
            >
              {recent.map((r) => (
                <li key={r.id} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {sourceLabel(r.source)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{r.rawText}</p>
                  {r.distilledAt && (
                    <p className="mt-2 text-xs text-emerald-500">
                      Distilled {formatDate(r.distilledAt)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
