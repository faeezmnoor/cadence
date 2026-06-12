"use client";

/**
 * Settings-surfacing v1 (gap 1) — the timezone control on the hub's
 * Account card. Design §5:
 *
 *   - Native <select> with Detected / Common / All optgroups (OS wheel
 *     beats a hand-rolled combobox on the phones users configure from).
 *   - Changing the select does NOT save: a confirm-before-commit row
 *     computes the real consequence ("your next brief moves to …") from
 *     account.timezonePreview before anything is written.
 *   - Silent browser capture ONLY for users with zero briefs (PRD §4.1
 *     flow A): a new account has nothing scheduled, so adopting the
 *     device zone is safe. Users with briefs are never silently moved —
 *     they get the suggest banner (timezone-suggest-banner.tsx) instead.
 *
 * Copy: "your local time" anchors the user-facing language; the IANA
 * zone is shown as the precise label (COPY_GUIDE timezone canon).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

/** Design §5 "Common" group — SEA-first, then the usual suspects. */
const COMMON_ZONES = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "Asia/Hong_Kong",
  "Asia/Manila",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** "Kuala Lumpur" from "Asia/Kuala_Lumpur". */
export function zoneCity(zone: string): string {
  const tail = zone.split("/").pop() ?? zone;
  return tail.replace(/_/g, " ");
}

/** "Kuala Lumpur — GMT+8" (offset computed live so DST zones read right). */
export function zoneLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return offset ? `${zoneCity(zone)} — ${offset}` : zoneCity(zone);
  } catch {
    return zoneCity(zone);
  }
}

function formatInZone(iso: string | Date, zone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function AccountTimezone({
  initialTimezone,
  hasBriefs,
}: {
  initialTimezone: string;
  hasBriefs: boolean;
}) {
  const [saved, setSaved] = useState(initialTimezone);
  const [draft, setDraft] = useState(initialTimezone);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const detected = useMemo(detectBrowserTimezone, []);
  const zones = useMemo<string[]>(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return COMMON_ZONES;
    }
  }, []);

  const updateTimezone = trpc.account.updateTimezone.useMutation();

  // PRD §4.1 flow A — silent capture for zero-brief users only. The ref
  // guards against refetch flicker re-firing the mutation.
  const captureFiredRef = useRef(false);
  useEffect(() => {
    if (hasBriefs) return;
    if (!detected || detected === initialTimezone) return;
    if (!zones.includes(detected)) return;
    if (captureFiredRef.current) return;
    captureFiredRef.current = true;
    updateTimezone.mutate(
      { timezone: detected },
      {
        onSuccess: () => {
          setSaved(detected);
          setDraft(detected);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBriefs, detected, initialTimezone, zones]);

  const dirty = draft !== saved;
  const preview = trpc.account.timezonePreview.useQuery(
    { timezone: draft },
    { enabled: dirty }
  );

  function confirm() {
    setSavedNote(null);
    updateTimezone.mutate(
      { timezone: draft },
      {
        onSuccess: (res) => {
          setSaved(draft);
          setSavedNote(
            res.nextRunAt
              ? `Saved. Next brief: ${formatInZone(res.nextRunAt, draft)} (${zoneCity(draft)} time).`
              : "Saved."
          );
        },
      }
    );
  }

  const commonZones = COMMON_ZONES.filter(
    (z) => z !== detected && zones.includes(z)
  );
  const previewData = preview.data;

  return (
    <div className="mt-4">
      <label
        htmlFor="account-timezone"
        className="block text-sm font-medium text-foreground"
      >
        Timezone
      </label>
      <select
        id="account-timezone"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedNote(null);
        }}
        disabled={updateTimezone.isPending}
        className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-60"
      >
        {detected && zones.includes(detected) && (
          <optgroup label="Detected">
            <option value={detected}>{zoneLabel(detected)}</option>
          </optgroup>
        )}
        <optgroup label="Common">
          {commonZones.map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z)}
            </option>
          ))}
        </optgroup>
        <optgroup label="All timezones">
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Briefs are scheduled in your local time ({saved}).
      </p>

      {dirty && (
        <div
          role="status"
          className="mt-3 rounded-md border border-border bg-background p-3 text-sm"
        >
          {preview.isLoading ? (
            <p className="text-muted-foreground">
              Checking what changes for your briefs…
            </p>
          ) : previewData && previewData.activeCount > 0 && previewData.nextRunAt ? (
            <>
              <p className="text-foreground">
                Your next brief moves to{" "}
                {formatInZone(previewData.nextRunAt, draft)} ({zoneCity(draft)}{" "}
                time) — currently{" "}
                {formatInZone(previewData.nextRunAt, saved)} in{" "}
                {zoneCity(saved)}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {previewData.activeCount === 1
                  ? "1 active brief reschedules."
                  : `All ${previewData.activeCount} active briefs reschedule.`}
              </p>
            </>
          ) : (
            <p className="text-foreground">
              New briefs will be scheduled in {zoneCity(draft)} time.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={updateTimezone.isPending}
              className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
            >
              {updateTimezone.isPending ? "Saving…" : "Confirm timezone"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(saved);
                setSavedNote(null);
              }}
              disabled={updateTimezone.isPending}
              className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {savedNote && !dirty && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {savedNote}
        </p>
      )}
      {updateTimezone.isError && (
        <p className="mt-2 text-xs text-destructive" role="status">
          Couldn&apos;t save your timezone. Your schedule hasn&apos;t changed.
          Try again.
        </p>
      )}
    </div>
  );
}
