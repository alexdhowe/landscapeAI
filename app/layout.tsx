import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { BRAND_NAME, HEADLINE, TAGLINE, TITLE_TEMPLATE } from "@/lib/site/brand";
import { siteUrl } from "@/lib/site/url";

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


export const metadata: Metadata = {
  // Relative OG/icon URLs need a base. Resolved at request time from
  // SITE_URL (or whatever the host already knows about itself) — see
  // lib/site/url.ts for why the NEXT_PUBLIC_ variable alone was a trap.
  metadataBase: new URL(siteUrl()),
  title: {
    default: HEADLINE,
    // Every route sets its own title; this is the frame around it.
    template: TITLE_TEMPLATE,
  },
  description: TAGLINE,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: HEADLINE,
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
