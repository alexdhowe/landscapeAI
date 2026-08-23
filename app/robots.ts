import type { MetadataRoute } from "next";

import { siteUrl, siteUrlIsPlaceholder } from "@/lib/site/url";

/**
 * What a crawler may look at.
 *
 * The marketing page and nothing else. Everything past it is either
 * somebody's project — `/design/<uuid>` renders a photograph of a real
 * house alongside the contact details attached to it, and the UUID is the
 * only thing standing between a stranger and both — or the contractor
 * console, which shows cost, margin and every lead. None of that is
 * material a search index should hold, and a project URL that reaches an
 * index is a privacy incident rather than a ranking problem.
 *
 * This is the polite half of the answer and is not a control: it stops
 * crawlers that obey it, not people. The controls are elsewhere — the
 * console is behind auth, the project UUID is unguessable, and every page
 * past the front door also carries `robots: { index: false }` in its
 * metadata, which is the half that is honoured even when a URL is
 * discovered some other way.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrlIsPlaceholder() ? undefined : siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/start", "/design/", "/api/", "/dashboard", "/leads/", "/deltas", "/pricebook", "/login"],
      },
    ],
    ...(base ? { host: base } : {}),
  };
}
