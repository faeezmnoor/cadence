import { ImageResponse } from "next/og";

/**
 * Dynamic OG image. Renders at build/request time via @vercel/og.
 * Dark bg, wordmark in white, accent coral dot, tagline below.
 * 1200x630 — twitter:summary_large_image + og:image both consume this.
 */
export const runtime = "edge";
export const alt = "Cadence — a senior market researcher for your industry, delivered daily";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#0b0d12",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: 44, fontWeight: 600, color: "#ffffff", letterSpacing: "-0.02em" }}>
            Cadence
          </span>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              backgroundColor: "#f56a3c",
              marginTop: 22,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 72,
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          Your industry has a researcher now.
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#9aa4b2", maxWidth: 900 }}>
          A daily, sourced market brief — in your language, in the messaging app you already use. For the price of coffee.
        </div>
      </div>
    ),
    { ...size },
  );
}
