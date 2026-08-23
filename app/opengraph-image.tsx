import { ImageResponse } from "next/og";

export const alt =
  "LandscapeAI — photograph your yard, swap what's in it, see what it costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card. Drawn from the same tokens as the app (app/globals.css)
 * rather than exported from a design tool, so it cannot drift from the
 * product it is a picture of.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#1b3524",
          color: "#f0f6f1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="15" fill="#275033" />
            <path
              d="M32 13c10.5 0 19 8.3 19 18.5 0 3.9-1.3 7.6-3.5 10.6H16.5A17.8 17.8 0 0 1 13 31.5C13 21.3 21.5 13 32 13Z"
              fill="#8bbb96"
            />
            <rect x="10" y="45" width="44" height="5.5" rx="2.75" fill="#f0f6f1" />
          </svg>
          <div style={{ fontSize: 40, letterSpacing: -1 }}>LandscapeAI</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -2.5 }}>
            See what your yard could be.
          </div>
          <div style={{ fontSize: 32, color: "#8bbb96", lineHeight: 1.35 }}>
            Photograph it, swap what&apos;s in it, and get a real budget range —
            before anyone visits.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 24,
            color: "#b8d7bf",
          }}
        >
          <div
            style={{
              border: "1px solid #3d7c4d",
              borderRadius: 999,
              padding: "8px 20px",
            }}
          >
            No address required
          </div>
          <div
            style={{
              border: "1px solid #3d7c4d",
              borderRadius: 999,
              padding: "8px 20px",
            }}
          >
            Priced from real bids
          </div>
        </div>
      </div>
    ),
    size,
  );
}
