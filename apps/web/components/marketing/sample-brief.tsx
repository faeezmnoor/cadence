/**
 * Sample brief preview. Renders a channel-neutral messaging-app mockup of a
 * Cadence daily brief — content mirrors `public/sample-brief.html` and
 * `cadence/blueprint/sample-brief-palm-oil.md` (the locked exemplar).
 *
 * Channel-neutral: never identifies the surface as Telegram. It is just a
 * daily research brief delivered to your messaging app of choice.
 *
 * The phone SCREEN keeps its own fixed dark chat palette (like a real
 * screenshot would) so it renders identically in light and dark page
 * themes; only the bezel and caption use page design tokens.
 */
export function SampleBrief() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* phone frame — bezel follows the page theme like a physical device */}
      <div className="rounded-[2.5rem] border border-border bg-card p-2 shadow-xl">
        {/* screen — fixed chat palette, independent of page theme */}
        <div className="overflow-hidden rounded-[2rem] bg-[#0e1621] text-left">
          {/* status bar */}
          <div className="flex items-center justify-between bg-[#17212b] px-5 pb-0.5 pt-2.5 text-[10px] font-semibold tracking-wide text-[#9fb2c2]">
            <span>07:00</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              {/* signal bars */}
              <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 fill-current">
                <rect x="0" y="6" width="2" height="4" rx="0.5" />
                <rect x="4" y="4" width="2" height="6" rx="0.5" />
                <rect x="8" y="2" width="2" height="8" rx="0.5" />
                <rect x="12" y="0" width="2" height="10" rx="0.5" opacity="0.4" />
              </svg>
              {/* battery */}
              <svg viewBox="0 0 22 10" className="h-2.5 w-5">
                <rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="currentColor" />
                <rect x="2" y="2" width="13" height="6" rx="1" fill="currentColor" />
                <rect x="20" y="3" width="2" height="4" rx="1" fill="currentColor" opacity="0.6" />
              </svg>
            </span>
          </div>

          {/* chat header */}
          <div className="flex items-center gap-2 bg-[#17212b] px-2.5 pb-2.5 pt-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
            {/* back chevron */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-[#6ab3f3]"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {/* avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#ff9d6b] to-[#dd5f33] text-sm font-semibold text-white">
              C
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-[13.5px] font-semibold leading-tight text-[#f2f6fa]">
                Cadence
                {/* verified-style check */}
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                  <circle cx="8" cy="8" r="8" fill="#54a7e8" />
                  <path
                    d="M4.6 8.3l2.2 2.2 4.4-4.6"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </p>
              <p className="text-[11.5px] leading-tight text-[#6ab3f3]">bot</p>
            </div>
            {/* kebab */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-[#768d9e]" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </div>

          {/* chat area — tinted wallpaper with subtle dot pattern */}
          <div className="px-2 pb-2.5 pt-2 [background-image:radial-gradient(circle_at_1px_1px,rgba(106,179,243,0.07)_1px,transparent_1.5px)] [background-size:16px_16px]">
            {/* date pill */}
            <div className="mb-2 flex justify-center">
              <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] font-medium text-[#a4b8c8]">
                10 Jun 2026
              </span>
            </div>

            {/* received message group: bubble + inline keyboard */}
            <div className="mr-6">
              {/* bubble with asymmetric corner + tail */}
              <div className="relative rounded-2xl rounded-bl-[5px] bg-[#182533] px-3 pb-1.5 pt-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                {/* tail */}
                <svg
                  viewBox="0 0 9 17"
                  className="absolute -left-[7px] bottom-0 h-[17px] w-[9px] text-[#182533]"
                  aria-hidden="true"
                >
                  <path fill="currentColor" d="M9 17c-3.6-.6-6.6-3.2-8.2-7.2L0 7v10h9z" />
                </svg>

                {/* brief body — content mirrors the locked exemplar */}
                <div className="space-y-2 text-[12.5px] leading-relaxed text-[#dbe5ee]">
                  <p className="font-semibold text-[#f2f6fa]">
                    <span aria-hidden="true">🌾</span> Cadence · Daily · 10 Jun 2026
                  </p>
                  <p className="text-[#8fa6b8]">Palm oil &amp; feedstock</p>
                  <p className="italic text-[#8fa6b8]">
                    Tuned for: Johor feed mill buying palm kernel + soymeal
                  </p>

                  <p className="pt-1">
                    <span className="font-medium">TL;DR —</span> CPO holds RM3,920
                    (<span className="text-[#f37f7f]">▼0.4%</span>); MPOB lifts June export
                    quota 12%; soyoil firms on US dryness{" "}
                    <span className="text-[#6ab3f3]">[1][2]</span>.
                  </p>

                  <p className="pt-1 font-medium text-[#ee8b66]">Prices</p>
                  <ul className="space-y-1 text-[#aebdcb]">
                    <li>
                      • CPO Aug: RM3,920 <span className="text-[#f37f7f]">▼0.4%</span> · 7d{" "}
                      <span className="text-[#57c98f]">▲2.1%</span>
                    </li>
                    <li>
                      • Soyoil 47.2¢/lb <span className="text-[#57c98f]">▲1.1%</span> on US
                      dryness <span className="text-[#6ab3f3]">[2]</span>
                    </li>
                    <li>• Brent $82.4 — soft Asia demand signal</li>
                  </ul>

                  <p className="pt-1 font-medium text-[#ee8b66]">What moved</p>
                  <ul className="space-y-1 text-[#aebdcb]">
                    <li>
                      • MPOB raised June export quota 12% on May stock build-up{" "}
                      <span className="text-[#6ab3f3]">[1]</span>
                    </li>
                    <li>
                      • China soy crush margins at 18-month high{" "}
                      <span className="text-[#6ab3f3]">[3]</span>
                    </li>
                  </ul>

                  <p className="pt-2 font-medium text-[#f2f6fa]">Why this matters to you</p>
                  <p className="text-[#aebdcb]">
                    Both of your main inputs moved the same direction this week — worth
                    checking supplier quotes before Friday.
                  </p>

                  <p className="pt-1 text-[11.5px] italic text-[#8fa6b8]">
                    Reply <span aria-hidden="true">👍</span> /{" "}
                    <span aria-hidden="true">👎</span> — or just tell us what to change
                  </p>
                </div>

                {/* timestamp, bottom-right inside the bubble */}
                <p className="mt-0.5 text-right text-[10.5px] leading-none text-[#6d8295]">
                  07:00
                </p>
              </div>

              {/* inline keyboard attached below the bubble */}
              <div className="mt-[3px] space-y-[3px]">
                <div className="flex gap-[3px]">
                  <div className="flex-1 rounded-[6px] bg-white/10 py-1.5 text-center text-[12px] font-medium text-[#dcebf7]">
                    <span aria-hidden="true">👍</span> More like this
                  </div>
                  <div className="flex-1 rounded-[6px] bg-white/10 py-1.5 text-center text-[12px] font-medium text-[#dcebf7]">
                    <span aria-hidden="true">👎</span> Less like this
                  </div>
                </div>
                <div className="flex gap-[3px]">
                  <div className="flex-1 rounded-[6px] bg-white/10 py-1.5 text-center text-[12px] font-medium text-[#dcebf7]">
                    <span aria-hidden="true">🔥</span> Loved it
                  </div>
                  <div className="flex-1 rounded-[6px] bg-white/10 py-1.5 text-center text-[12px] font-medium text-[#dcebf7]">
                    <span aria-hidden="true">💤</span> Skip topic
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* compose bar */}
          <div className="flex items-center gap-3 bg-[#17212b] px-4 py-2.5">
            {/* paperclip */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-[#768d9e]"
              aria-hidden="true"
            >
              <path
                d="M21 12.5l-8.5 8.5a6 6 0 01-8.5-8.5L12.5 4a4 4 0 015.7 5.7L9.7 18.2a2 2 0 01-2.8-2.8l7.8-7.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="flex-1 text-[13px] text-[#5d7183]">Message</span>
            {/* mic */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-[#768d9e]"
              aria-hidden="true"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path
                d="M5 11a7 7 0 0014 0M12 18v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        A sample brief. Yours is written fresh every morning, in your language.
      </p>
    </div>
  );
}
