/**
 * Sample brief preview. Renders a channel-neutral messaging-app mockup of a
 * Cadence daily brief — content mirrors `public/sample-brief.html` and
 * `cadence/blueprint/sample-brief-palm-oil.md` (the locked exemplar).
 *
 * Channel-neutral: never identifies the surface as Telegram. It's just a
 * daily research brief delivered to your messaging app of choice.
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
              <p className="text-xs text-muted-foreground">today · 07:00</p>
            </div>
          </div>

          {/* brief body — content mirrors the locked exemplar */}
          <div className="mt-3 space-y-2 text-left text-[13px] leading-relaxed">
            <p className="font-semibold">
              <span aria-hidden>🌾</span> Cadence · Daily · 2 Jun 2026
            </p>
            <p className="text-muted-foreground">Palm oil &amp; feedstock</p>
            <p className="text-muted-foreground italic">
              Tuned for: KL plantation trader watching CPO + Bursa planters
            </p>

            <p className="pt-1">
              <span className="font-medium">TL;DR —</span> CPO holds RM3,920
              (<span className="text-red-500">▼0.4%</span>); MPOB lifts June export
              quota 12%; soyoil firms on US dryness{" "}
              <span className="text-sky-500">[1][2]</span>.
            </p>

            <p className="pt-1 font-medium text-brand">Prices</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• CPO Aug: RM3,920 <span className="text-red-500">▼0.4%</span> · 7d <span className="text-emerald-500">▲2.1%</span></li>
              <li>• Soyoil 47.2¢/lb <span className="text-emerald-500">▲1.1%</span> on US dryness <span className="text-sky-500">[2]</span></li>
              <li>• Brent $82.4 — soft Asia demand signal</li>
            </ul>

            <p className="pt-1 font-medium text-brand">What moved</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• MPOB raised June export quota 12% on May stock build-up <span className="text-sky-500">[1]</span></li>
              <li>• China soy crush margins at 18-month high <span className="text-sky-500">[3]</span></li>
            </ul>

            <p className="pt-2 font-medium">Why this matters to you</p>
            <p className="text-muted-foreground">
              Your CPO short gets a near-term tailwind from the quota lift; soyoil
              long in the pair-trade is in the money on 7d.
            </p>

            <p className="pt-2 text-xs italic text-muted-foreground">
              Reply 👍 / 👎 — or just tell us what to change
            </p>

            <div className="mt-2 flex gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-0.5">👍</span>
              <span className="rounded-full border border-border px-2 py-0.5">👎</span>
              <span className="rounded-full border border-border px-2 py-0.5">adjust…</span>
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
