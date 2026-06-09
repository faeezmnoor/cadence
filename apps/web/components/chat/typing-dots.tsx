"use client";

/**
 * Three pulsing dots. CSS animation only — no JS tick.
 *
 * Blueprint §2.7. ARIA: role="status" with sr-only label so screen readers
 * announce "Cadence is typing" instead of the bare dots.
 */
export function TypingDots() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1 text-muted-foreground"
    >
      <span className="sr-only">Cadence is typing</span>
      <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-muted-foreground/70" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-muted-foreground/70" style={{ animationDelay: "200ms" }} />
      <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-muted-foreground/70" style={{ animationDelay: "400ms" }} />
    </div>
  );
}
