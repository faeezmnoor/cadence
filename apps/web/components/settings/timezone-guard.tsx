"use client";

/**
 * Review CPO HIGH-1 — timezone capture + suggest banner, mounted on every
 * page a returning user actually lands on (/chat, /briefs, /settings),
 * not just /settings.
 *
 * One component owns BOTH timezone-mismatch behaviours (PRD §4.1):
 *   - flow A (zero briefs): silently adopt the device zone — a new
 *     account has nothing scheduled, so the capture is safe. This effect
 *     used to live inside AccountTimezone (settings-only mount, which is
 *     exactly the HIGH-1 gap); it lives here now and AccountTimezone is
 *     purely the select control. Single capture site — no double-fire
 *     when /settings mounts both components.
 *   - flow B (with briefs): never silently move a live schedule — render
 *     the suggest banner instead (timezone-suggest-banner.tsx).
 *
 * Props are server-computed (users.timezone + active/paused spec count)
 * so the guard renders nothing for already-consistent users without a
 * client round-trip.
 */
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { detectBrowserTimezone } from "@/components/settings/account-timezone";
import { TimezoneSuggestBanner } from "@/components/settings/timezone-suggest-banner";

export function TimezoneGuard({
  savedTimezone,
  hasBriefs,
  bannerClassName,
}: {
  savedTimezone: string;
  hasBriefs: boolean;
  /** Per-surface spacing for the suggest banner (defaults to mb-6). */
  bannerClassName?: string;
}) {
  const router = useRouter();
  const detected = useMemo(detectBrowserTimezone, []);
  const updateTimezone = trpc.account.updateTimezone.useMutation();

  // PRD §4.1 flow A — silent capture for zero-brief users only. The ref
  // guards against refetch flicker re-firing the mutation.
  const captureFiredRef = useRef(false);
  useEffect(() => {
    if (hasBriefs) return;
    if (!detected || detected === savedTimezone) return;
    try {
      // Only adopt zones the saving select could also offer; the server
      // re-validates via isValidIanaTimezone regardless.
      if (!Intl.supportedValuesOf("timeZone").includes(detected)) return;
    } catch {
      return;
    }
    if (captureFiredRef.current) return;
    captureFiredRef.current = true;
    updateTimezone.mutate(
      { timezone: detected },
      {
        // Re-render server components so /settings' AccountTimezone (and
        // any next-delivery copy) picks up the captured zone.
        onSuccess: () => router.refresh(),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBriefs, detected, savedTimezone]);

  if (!hasBriefs) return null;
  return (
    <TimezoneSuggestBanner
      savedTimezone={savedTimezone}
      hasBriefs={hasBriefs}
      className={bannerClassName}
    />
  );
}
