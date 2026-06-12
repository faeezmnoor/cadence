/**
 * Settings-surfacing v1 (gap 11) — shared delivery-on-hold banner.
 *
 * Rendered on /briefs and /app/link when delivery is impossible:
 *   - reason="unlinked"        : user disconnected (or never connected)
 *                                Telegram while holding briefs.
 *   - reason="delivery_broken" : pipeline escalated users.state after
 *                                repeated send failures.
 *
 * Error anatomy (COPY_GUIDE §7): ① what happened ② what it means for your
 * briefs/money ③ exactly one action. The money line is the canonical
 * skipped-not-charged sentence: "Deliveries are on hold — no credits are
 * used while disconnected." "Connect Telegram" stays verbatim.
 *
 * Server-safe (no hooks) so server pages can render it directly; it
 * resolves itself because those pages re-read users.state per request.
 */
import Link from "next/link";

export function DeliveryBrokenBanner({
  reason,
  showAction = true,
}: {
  reason: "unlinked" | "delivery_broken";
  showAction?: boolean;
}) {
  const broken = reason === "delivery_broken";
  return (
    <section
      role={broken ? "alert" : "status"}
      data-testid="delivery-broken-banner"
      className="rounded-xl border border-warning/30 bg-warning/10 p-4"
    >
      <p className="text-sm font-semibold text-warning">
        {broken
          ? "We couldn't reach your Telegram."
          : "Telegram is disconnected."}
      </p>
      <p className="mt-1 text-sm text-foreground">
        Deliveries are on hold — no credits are used while disconnected. Your
        briefs, schedules, and learning are untouched; delivery resumes at the
        next scheduled time once you reconnect.
      </p>
      {showAction && (
        <Link
          href={"/app/link" as never}
          className="mt-3 inline-flex min-h-11 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:min-h-9"
        >
          {broken ? "Reconnect Telegram" : "Connect Telegram"}
        </Link>
      )}
    </section>
  );
}
