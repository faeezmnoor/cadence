/**
 * /auth/sign-in must render Google OAuth as the primary CTA, with the
 * magic-link form below an "or use email" divider.
 *
 * We don't run a full React render here — vitest's vite transformer chokes
 * on `jsx: preserve` from the Next tsconfig, and pulling in a JSX-aware
 * pipeline (or React Testing Library + jsdom) just to assert two strings
 * is overkill for a side project's test surface.
 *
 * Instead we read the page source and the Google button source as plain
 * files and assert the structural contract:
 *   1. The page imports the GoogleSignInButton component.
 *   2. The Google CTA is rendered BEFORE the email form in source order
 *      (so it's the visual primary).
 *   3. The "or use email" divider sits between them.
 *   4. The Google button wires signInWithOAuth with provider: "google".
 *
 * Why this matters: regressions that quietly remove the Google button or
 * flip the order back to email-first would push everyone onto the tedious
 * magic-link flow. This locks the contract.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(
  resolve(here, "../app/auth/sign-in/page.tsx"),
  "utf8"
);
const buttonSrc = readFileSync(
  resolve(here, "../components/auth/google-sign-in-button.tsx"),
  "utf8"
);

describe("/auth/sign-in source contract", () => {
  it("imports and uses the GoogleSignInButton", () => {
    expect(pageSrc).toMatch(
      /from\s+"@\/components\/auth\/google-sign-in-button"/
    );
    expect(pageSrc).toContain("<GoogleSignInButton");
  });

  it("renders Google CTA above the magic-link form, with divider between", () => {
    const googleIdx = pageSrc.indexOf("<GoogleSignInButton");
    // Use the JSX <span> wrapper to skip the docstring mention.
    const dividerIdx = pageSrc.indexOf("<span>or use email</span>");
    const emailFormIdx = pageSrc.indexOf("Email me a link");

    expect(googleIdx).toBeGreaterThan(-1);
    expect(dividerIdx).toBeGreaterThan(googleIdx);
    expect(emailFormIdx).toBeGreaterThan(dividerIdx);
  });

  it("keeps the magic-link fallback available", () => {
    // We don't want to accidentally drop magic-link entirely while moving
    // Google to primary — fallback for users who don't want Google.
    expect(pageSrc).toContain("Email me a link");
    expect(pageSrc).toContain("/api/auth/sign-in");
  });
});

describe("GoogleSignInButton wiring", () => {
  it("calls supabase.auth.signInWithOAuth with provider 'google'", () => {
    expect(buttonSrc).toMatch(/signInWithOAuth\s*\(/);
    expect(buttonSrc).toMatch(/provider:\s*"google"/);
  });

  it("computes redirectTo against /auth/callback", () => {
    expect(buttonSrc).toContain("/auth/callback");
    expect(buttonSrc).toMatch(/window\.location\.origin/);
  });

  it("exposes an accessible label", () => {
    expect(buttonSrc).toMatch(/aria-label="Continue with Google"/);
  });
});
