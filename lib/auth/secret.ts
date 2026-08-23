/**
 * The signing secret for session cookies.
 *
 * Required in production — a predictable secret means anyone can mint a
 * contractor session, and the contractor console shows cost, margin and
 * every lead's contact details. In development and test a fixed, clearly
 * labeled value keeps `npm run dev` and `npm test` working with no setup.
 *
 * Server-only.
 */
const DEV_SECRET = "landscapeai-development-secret-do-not-use-in-production";

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` — without it, contractor sessions are forgeable.",
    );
  }
  return DEV_SECRET;
}

const SECURE_COOKIE_NAME = "__Secure-authjs.session-token";
const PLAIN_COOKIE_NAME = "authjs.session-token";

/**
 * Auth.js's cookie name, which is also the salt its JWE derivation uses,
 * so both accessors in lib/auth/session.ts must agree with it exactly.
 *
 * This is the name a session is *written* under. Reading one goes through
 * `sessionCookieNames()` — see why there.
 */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? SECURE_COOKIE_NAME
    : PLAIN_COOKIE_NAME;
}

/**
 * Every cookie name a session might have arrived under, most likely first.
 *
 * Auth.js does not choose the `__Secure-` prefix from NODE_ENV — it
 * chooses it from the **scheme of the request**, because a `__Secure-`
 * cookie is only valid over HTTPS. So a production build served over plain
 * HTTP writes `authjs.session-token` while this module, reading NODE_ENV
 * alone, looked only for `__Secure-authjs.session-token` and found
 * nothing. The symptom was a signed-in rep whose page rendered but whose
 * lead photo came back 401, because the page reads the session through
 * Auth.js and the route handler read it through here.
 *
 * Trying both is not a weakening: the cookie name is also the JWE salt, so
 * a token still only decodes under the name it was actually written with.
 * A wrong guess fails to decode; it cannot be forced.
 */
export function sessionCookieNames(): readonly string[] {
  return process.env.NODE_ENV === "production"
    ? [SECURE_COOKIE_NAME, PLAIN_COOKIE_NAME]
    : [PLAIN_COOKIE_NAME, SECURE_COOKIE_NAME];
}
