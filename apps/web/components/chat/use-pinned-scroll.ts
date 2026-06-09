"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Smart autoscroll hook with "pause-on-scroll-up" behavior.
 *
 * Behavior (blueprint §2.7):
 *  - On mount and when `dep` changes (e.g. new message arrived):
 *    - if user is "stuck to bottom" → smooth-scroll to bottom.
 *    - if user has scrolled away from bottom → DO NOT yank back.
 *  - "Stuck to bottom" means scroll position is within STICKY_THRESHOLD_PX
 *    of the bottom.
 *  - User scrolling re-evaluates the stuck flag immediately.
 *
 * Caller wires the returned ref to the scroll region and passes any
 * dependency that should trigger an autoscroll attempt (typically the
 * message-list length or last message id).
 */
const STICKY_THRESHOLD_PX = 96;

export function usePinnedScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(true);

  const evaluateStuck = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setStuck(distance <= STICKY_THRESHOLD_PX);
  }, []);

  // Whenever the dep changes, scroll iff stuck.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!stuck) return;
    // Smooth when close, instant when far (avoid long animations on big jumps).
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: distance > 800 ? "auto" : "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep, stuck]);

  // Watch user scroll to flip stuck flag.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => evaluateStuck();
    el.addEventListener("scroll", onScroll, { passive: true });
    evaluateStuck();
    return () => el.removeEventListener("scroll", onScroll);
  }, [evaluateStuck]);

  return { ref, stuck };
}
