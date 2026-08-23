/**
 * The edge of the app: two gates, neither of them inside a handler.
 *
 * 1. **Rate limiting**, on `/api`. Ten routes are anonymous by design and
 *    none of them was metered — `POST /api/projects` takes 25 MB and spends
 *    ~1.5 s of CPU-bound image decode on it, `POST /api/vision` spends a
 *    metered Anthropic call, and neither needs any skill to run in a loop.
 *    Refusing here is what keeps the body unbuffered and the decoder cold;
 *    a check inside the handler would have paid the bill before saying no.
 *    Budgets live in `lib/ratelimit/policy.ts`.
 *
 * 2. **The aerial leg's licence gate.** `/design/[projectId]/locate` may
 *    only be served where the imagery and geocoder terms have been
 *    declared (`lib/locate/gate.ts`). The page checks this too, but a page
 *    sits behind a `loading.tsx` Suspense boundary, so its own `notFound()`
 *    resolves after the 200 has already been streamed — a gate that
 *    answers "200 OK" is not a gate. Here it is decided before anything is
 *    rendered, and a customer who bookmarked the URL is sent back to their
 *    design rather than into a dead end.
 *
 * 3. **The first gate on the contractor console**, unchanged. This only
 *    checks that a session cookie is PRESENT, and redirects to the login
 *    page when it isn't. It deliberately does not verify the token:
 *    middleware runs on every matched request and, in the Auth.js
 *    split-config pattern, cannot reach the database anyway. Verification
 *    happens where the authorization decision is actually made —
 *    `app/(contractor)/layout.tsx` for pages, `requireContractor()` for the
 *    API routes — so a forged cookie gets past this and no further.
 *    Treat it as UX (send a signed-out person somewhere useful), not as
 *    security.
 */
import { NextResponse, type NextRequest } from "next/server";

import { locateEnabled } from "@/lib/locate/gate";
import { limiter } from "@/lib/ratelimit";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

const CONSOLE_PREFIXES = ["/dashboard", "/leads", "/deltas", "/pricebook"];

export function middleware(request: NextRequest) {
  const verdict = limiter.check(request, {
    RATE_LIMIT: process.env.RATE_LIMIT,
    RATE_LIMIT_CLIENT_IP_HEADER: process.env.RATE_LIMIT_CLIENT_IP_HEADER,
  });

  if (verdict && !verdict.allowed) {
    // Shed load, and say when to come back. No detail about the budget or
    // who else is spending it — a limiter that explains itself is a limiter
    // that can be measured and stepped around.
    return NextResponse.json(
      { error: "Too many requests — give it a moment and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(verdict.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const { pathname } = request.nextUrl;

  const locate = pathname.match(/^(\/design\/[^/]+)\/locate\/?$/);
  if (locate && !locateEnabled()) return redirect(request, locate[1]);

  // Every gate below this line is the console's. Anything else — the
  // customer surfaces, the API routes, the login page itself — is done.
  //
  // Stated as "which paths ARE the console" rather than "everything that
  // is not an API route", because the matcher below cannot be relied on to
  // deliver only the paths it names: a `:projectId` parameter in one entry
  // was enough to make Next match every path in the app, which put the
  // landing page behind a login redirect and cost a browser pass to find.
  // A middleware that is correct on any input it is handed cannot be
  // broken that way again.
  if (!isConsole(pathname)) return NextResponse.next();

  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const next = encodeURIComponent(pathname + request.nextUrl.search);
  return redirect(request, `/login?next=${next}`);
}

/** The contractor console: `app/(contractor)/`, and nothing else. */
export function isConsole(pathname: string): boolean {
  return CONSOLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * A redirect to a path on this same site.
 *
 * Deliberately not `NextResponse.redirect(new URL(path, request.url))`,
 * which is the documented pattern and is wrong here: in a self-hosted
 * Next server the URL middleware sees is built from the process's own
 * hostname and port, not from the Host header the browser sent. Behind a
 * proxy — which is every deployment — that produces
 * `Location: http://localhost:8080/login` and sends the customer nowhere.
 * A relative Location would sidestep it, but Next parses this header as an
 * absolute URL and throws, so the host has to be reconstructed from the
 * request.
 *
 * Sending someone back to the host they asked for is not an open redirect:
 * the path is always one of this app's own, and a caller who forges the
 * Host header only redirects themselves.
 *
 * Found by running the production build behind a proxied Host header,
 * which is also how the signed-out console redirect — which has always
 * used the documented pattern — turned out to have been carrying the same
 * bug since the auth session.
 */
function redirect(request: NextRequest, path: string): NextResponse {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  const base = host ? `${proto}://${host}` : request.nextUrl.origin;
  return NextResponse.redirect(new URL(path, base), {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Which requests reach the code above.
 *
 * Only literal prefixes and `:path*` subtrees appear here. A named
 * parameter in the middle of an entry (`/design/:projectId/locate`) made
 * Next hand this function every path in the application — which put the
 * landing page behind the console's login redirect, and cost a browser
 * pass to find. The rule is that an entry names a subtree and the function
 * decides what happens inside it; the test file holds this list to that
 * shape, and the function is written to be correct even when the matcher
 * is wider than it says.
 */
export const config = {
  matcher: [
    "/api/:path*",
    "/design/:path*",
    "/dashboard/:path*",
    "/leads/:path*",
    "/deltas/:path*",
    "/pricebook/:path*",
  ],
};
