---
# Google DESIGN.md format (alpha). Phase one: this frontmatter MIRRORS today's code tokens (apps/web/app/globals.css :root, apps/web/tailwind.config.ts); it does not generate them yet. Change a value only by decision, id beside the value.
colors:
  background: "hsl(0 0% 100%)"            # globals.css --background; pure white, a recorded debt
  foreground: "hsl(222.2 84% 4.9%)"
  card: "hsl(0 0% 100%)"
  card-foreground: "hsl(222.2 84% 4.9%)"
  primary: "hsl(222.2 47.4% 11.2%)"
  primary-foreground: "hsl(210 40% 98%)"
  secondary: "hsl(210 40% 96.1%)"
  secondary-foreground: "hsl(222.2 47.4% 11.2%)"
  muted: "hsl(210 40% 96.1%)"
  muted-foreground: "hsl(215.4 16.3% 46.9%)"
  accent: "hsl(210 40% 96.1%)"
  accent-foreground: "hsl(222.2 47.4% 11.2%)"
  destructive: "hsl(0 84.2% 60.2%)"
  destructive-foreground: "hsl(210 40% 98%)"
  border: "hsl(214.3 31.8% 91.4%)"
  input: "hsl(214.3 31.8% 91.4%)"
  ring: "hsl(222.2 84% 4.9%)"
  brand: "hsl(14 72% 45%)"                 # terracotta accent
  brand-foreground: "hsl(0 0% 100%)"
  success: "hsl(158 64% 26%)"
  success-foreground: "hsl(0 0% 100%)"
  warning: "hsl(32 90% 30%)"
  warning-foreground: "hsl(0 0% 100%)"
typography:
  body: { fontFamily: "system sans (Tailwind font-sans default stack)", fontSize: 16, fontWeight: 400, lineHeight: 1.5 }
  display: { fontFamily: "\"Iowan Old Style\", \"Charter\", Georgia, Cambria, \"Times New Roman\", Times, serif", fontWeight: 700, use: "marketing H1 only" }
spacing:
  scale: "Tailwind default (4px unit)"
  container: { padding: "2rem", max-2xl: "1400px" }
rounded:
  lg: "0.5rem"                             # --radius
  md: "calc(0.5rem - 2px)"
  sm: "calc(0.5rem - 4px)"
shadows:
  scale: "Tailwind default (shadow-sm, shadow-xl in use)"
motion:
  typing-dot: "typing-dot 1.4s ease-in-out infinite"
  chat-fade-in: "chat-fade-in 120ms ease-out"
components:
  button-primary: { background: brand, text: brand-foreground, rounded: md }
  badge-best-value: { background: brand, text: brand-foreground, rounded: full }
  status-text: { success: success, warning: warning, danger: destructive }
---
<!-- layer: knowledge · status: living (changes only by decision) · verified: 2026-10-06 · budget: 200 lines -->
# Cadence design

## Overview
A calm, editorial research product: plain slate surfaces, one terracotta brand accent, and serif headlines on marketing pages to signal "a senior researcher's publication" rather than "an app". The memorable thing is the brief itself, a well-set research note. It must never look like a crypto dashboard, a chat toy or a "Telegram bot" landing page (decision 0001).

Phase one (2026-10-06): the frontmatter mirrors the tokens in the code; nothing was redesigned. The token-to-source table is in docs/slices/001-adopt-standard/notes.md (T014). Generation of the code's token files from this frontmatter is a later step.

## Colors
- Light theme tokens are in the frontmatter (apps/web/app/globals.css `:root`). The dark theme (`.dark`, lines 42–65) mirrors them: background and card `hsl(222.2 84% 4.9%)`, foreground `hsl(210 40% 98%)`, brand `hsl(14 72% 44%)`, success `hsl(158 55% 48%)`, warning `hsl(38 92% 55%)` with dark text.
- `brand` was darkened from 55% to 45% lightness so white text on it clears WCAG AA (about 5:1); it serves as the solid primary action and as a tint (`bg-brand/10`).
- `success` and `warning` are semantic per-theme tokens tuned to read as AA text on each background; `destructive` is the danger token. Callers use the tokens, not raw green, emerald or amber classes.
- Debt: the light `background` and `card` are pure white, which the house standard forbids for surfaces; change only by a decision.

## Typography
- Body: the system sans stack (`font-sans`, Tailwind default); no web font is loaded.
- Display: a system serif stack (Iowan Old Style, Charter, Georgia …) used only on marketing H1s (landing, pricing, how it works).
- Debt: no licensed, loaded typeface; change only by a decision.

## Layout
- Tailwind default spacing; container centred with 2rem padding, capped at 1400px.
- Viewports the design is judged at: 360×800 (mobile parity at 360px, from the archived designer agent) and 1440×900.
- iOS safe-area utilities in globals.css pair with `viewportFit=cover`.

## Elevation & Depth
Flat by default: borders (`border` token) separate surfaces; `shadow-sm` on raised cards, `shadow-xl` once for an overlay. No custom shadow tokens.

## Shapes
Radius token 0.5rem (`rounded-lg`), with `md` and `sm` 2px and 4px smaller; `rounded-full` for pills, avatars and badges.

## Components
No shared primitive library is installed: apps/web/components.json configures shadcn/ui, but no component has been added (no components/ui, no Radix packages in apps/web/package.json); feature folders under apps/web/components/ (chat, billing, settings, marketing, telegram, nav, delivery, auth) compose Tailwind classes on the tokens above. Named uses: primary action on `brand`, the "Best value" badge on `brand`, status text on `success`, `warning` and `destructive`. A components register (docs/design/components.md) is a Full-tier document and is not kept here.

## Do's and Don'ts
- Do use the semantic tokens; don't use raw palette colours or `dark:` colour variants for status.
- Don't lead any surface with the delivery channel (decision 0001).
- Don't show "Pro", "plan", "subscription" or "deep research" anywhere (decisions 0002, 0007, 0010).
- Don't change the pure-white surface or add a typeface without a decision record (recorded debts).
- Copy follows apps/web/COPY_GUIDE.md.

## Iconography, imagery, motion, accessibility
- Icons: lucide-react (components.json `iconLibrary`). Imagery: product screenshots only (docs/screenshots/ for the public README).
- Motion: two animations, the typing indicator and a 120ms chat fade-in; motion explains state, never decorates. A reduced-motion guard is not present in the code yet (verified by search; recorded debt).
- Accessibility: WCAG AA contrast on brand, success and warning tokens; 44-point touch targets; visible focus rings (`ring` token); a label on every control.
