"use client";

/**
 * Settings-surfacing v1 (gap 1) — the quiet "this device is in a
 * different timezone" suggestion for users WITH briefs (PRD §4.1 flow B:
 * never silently move a live schedule).
 *
 * Muted card, not warning-toned — nothing is broken. Dismiss ("Keep …")
 * persists per device via localStorage so it doesn't nag; a different
 * detected zone (travel, new device) re-triggers the suggestion.
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
}: {
  savedTimezone: string;
  hasBriefs: boolean;
}) {
  const router = useRouter();
  const detected = useMemo(detectBrowserTimezone, []);
  const [visible, setVisible] = useState(false);
  const updateTimezone = trpc.account.updateTimezone.useMutation();

  useEffect(() => {
    if (!hasBriefs) return; // zero-brief users get the silent capture instead
    if (!detected || detected === savedTimezone) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === detected) return;
    } catch {
      // localStorage unavailable — show the banner; worst case it nags.
    }
    setVisible(true);
  }, [hasBriefs, detected, savedTimezone]);

  if (!visible || !detected) return null;

  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-border bg-muted/40 p-4"
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
          className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
        >
          {updateTimezone.isPending
            ? "Saving…"
            : `Use ${zoneCity(detected)} time`}
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, detected);
            } catch {
              // best-effort persistence
            }
            setVisible(false);
          }}
          className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
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
