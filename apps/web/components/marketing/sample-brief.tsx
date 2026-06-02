/**
 * Sample brief preview. Renders a messaging-app mockup of a Cadence daily brief.
 *
 * TODO(stream-a): replace the inline placeholder content with `public/sample-brief.png`
 * (or .html embed) once Stream A's composer lands a real exemplar. This component is
 * already styled as a phone frame so swapping in an image is a one-line change.
 */
export function SampleBrief() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* phone frame */}
      <div className="rounded-[2.5rem] border border-border bg-card p-2 shadow-xl">
        <div className="rounded-[2rem] bg-background p-4">
          {/* messaging-app header */}
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
              C
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Cadence</p>
              <p className="text-xs text-muted-foreground">bot · today 07:00</p>
            </div>
          </div>

          {/* brief body — content is a representative sample */}
          <div className="mt-3 space-y-2.5 text-left text-[13px] leading-relaxed">
            <p className="font-semibold">
              <span aria-hidden>🌾</span> Cadence · Daily · 2 Jun
            </p>
            <p className="text-muted-foreground">Palm oil &amp; feedstock</p>

            <p>
              <span className="font-medium">TL;DR —</span> CPO holds at RM 3,920
              (<span className="text-red-500">▼0.4%</span>); MPOB raises June export quota;
              Indonesia DMO talk returns.
            </p>

            <p className="font-medium">Prices</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• CPO Aug: RM 3,920 <span className="text-red-500">▼0.4%</span> (24h)</li>
              <li>• Soyoil: 47.2¢ <span className="text-emerald-500">▲1.1%</span></li>
              <li>• Brent: $82.4 — soft demand</li>
            </ul>

            <p className="font-medium">What moved</p>
            <p className="text-muted-foreground">
              MPOB raised June export quota 12% on stock build-up. Bearish near-term.
              Indonesia floats reinstating DMO at 30% — bullish if confirmed.
            </p>

            <div className="mt-2 flex gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-0.5">👍</span>
              <span className="rounded-full border border-border px-2 py-0.5">👎</span>
              <span className="rounded-full border border-border px-2 py-0.5">tune…</span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Representative sample. Yours is composed fresh, in your language, every morning.
      </p>
    </div>
  );
}
