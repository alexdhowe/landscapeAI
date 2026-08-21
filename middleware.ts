/**
 * The first gate on the contractor console.
 *
 * This only checks that a session cookie is PRESENT, and redirects to the
 * login page when it isn't. It deliberately does not verify the token:
 * middleware runs on every matched request and, in the Auth.js split-config
 * pattern, cannot reach the database anyway. Verification happens where the
 * authorization decision is actually made —
 * `app/(contractor)/layout.tsx` for pages, `requireContractor()` for the
 * API routes — so a forged cookie gets past this and no further.
 *
 * Treat this as UX (send a signed-out person somewhere useful), not as
 * security.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/leads/:path*", "/deltas/:path*", "/pricebook/:path*"],
};
