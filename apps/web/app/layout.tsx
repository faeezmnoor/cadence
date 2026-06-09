import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCProvider } from "@/lib/trpc/provider";

export const metadata: Metadata = {
  title: "Cadence — a daily market researcher for your industry",
  description:
    "Daily, sourced market briefs for your industry — delivered to the messaging app you already use. Senior-researcher quality for the price of coffee.",
};

/**
 * viewportFit=cover opts the page into the iOS Safari "draw under the
 * notch/home indicator" mode. We pair this with the `safe-*` utilities
 * defined in globals.css (env(safe-area-inset-*) padding) so the AppNav,
 * sign-in form, and /app/link main don't get eaten by the notch on
 * iPhone X+. width=device-width + initialScale=1 is the standard
 * mobile-responsive baseline.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020817" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TRPCProvider>{children}</TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
