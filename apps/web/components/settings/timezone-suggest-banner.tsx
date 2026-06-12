"use client";

/**
 * Settings-surfacing v1 (gap 1) — the quiet "this device is in a
 * different timezone" suggestion for users WITH briefs (PRD §4.1 flow B:
 * never silently move a live schedule).
 *
 * Muted card, not warning-toned — nothing is broken. Dismiss ("Keep …")
 * persists via sessionStorage (review CPO LOW-3: the suggestion returns
 * next session until the mismatch is resolved — localStorage buried it
 * forever); a different detected zone (travel, new device) re-triggers
 * within the same session.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import {
  detectBrowserTimezone,
  zoneCity,
} from "@/components/settings/account-timezone";

const DISMISS_KEY = "cadence.tz-suggest-dismissed";

export function TimezoneSuggestBanner({
  savedTimezone,
  hasBriefs,
  className = "mb-6",
}: {
  savedTimezone: string;
  hasBriefs: boolean;
  /** Per-surface spacing (CPO HIGH-1: also mounted on /chat + /briefs). */
  className?: string;
}) {
  const router = useRouter();
  const detected = useMemo(detectBrowserTimezone, []);
  const [visible, setVisible] = useState(false);
  const updateTimezone = trpc.account.updateTimezone.useMutation();

  useEffect(() => {
    if (!hasBriefs) return; // zero-brief users get the silent capture instead
    if (!detected || detected === savedTimezone) return;
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === detected) return;
    } catch {
      // sessionStorage unavailable — show the banner; worst case it nags.
    }
    setVisible(true);
  }, [hasBriefs, detected, savedTimezone]);

  if (!visible || !detected) return null;

  return (
    <div
      role="status"
      className={`${className} rounded-xl border border-border bg-muted/40 p-4`}
    >
      <p className="text-sm text-foreground">
        Your briefs are scheduled in {zoneCity(savedTimezone)} time, but this
        device is in {zoneCity(detected)} time.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            updateTimezone.mutate(
              { timezone: detected },
              {
                onSuccess: () => {
                  setVisible(false);
                  router.refresh();
                },
              }
            )
          }
          disabled={updateTimezone.isPending}
          className="inline-flex min-h-11 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 sm:min-h-9"
        >
          {updateTimezone.isPending
            ? "Saving…"
            : `Use ${zoneCity(detected)} time`}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.setItem(DISMISS_KEY, detected);
            } catch {
              // best-effort persistence
            }
            setVisible(false);
          }}
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:min-h-9"
        >
          Keep {zoneCity(savedTimezone)}
        </button>
      </div>
      {updateTimezone.isError && (
        <p className="mt-2 text-xs text-destructive">
          Couldn&apos;t save your timezone. Your schedule hasn&apos;t changed.
          Try again.
        </p>
      )}
    </div>
  );
}
