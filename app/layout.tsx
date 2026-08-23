import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import "./globals.css";

/**
 * The one font pairing (app/globals.css binds these to --font-sans and
 * --font-display). Fraunces carries the wordmark and the top heading of a
 * customer surface; Inter carries everything else, including every number
 * in the contractor console.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const SITE_NAME = "LandscapeAI";
const TAGLINE =
  "Photograph your yard, swap what's in it, and see what projects like yours cost — before anyone visits.";

export const metadata: Metadata = {
  // Relative OG/icon URLs need a base. Configurable because the value is
  // deployment-specific and this repo deliberately has no deploy config.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: `${SITE_NAME} — see what your yard could be`,
    // Every route sets its own title; this is the frame around it.
    template: `%s · ${SITE_NAME}`,
  },
  description: TAGLINE,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — see what your yard could be`,
    description: TAGLINE,
  },
  twitter: { card: "summary_large_image" },
  // Nothing here should be indexed: every customer URL is an unguessable
  // project UUID and the console is private.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Not maximum-scale=1: pinch-zoom is an accessibility feature and
  // disabling it to stop iOS focus-zoom is the wrong fix. The right fix is
  // 16px form controls, which the type scale enforces.
  themeColor: "#275033",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
