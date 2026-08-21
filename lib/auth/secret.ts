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

/**
 * Auth.js's cookie name, which is also the salt its JWE derivation uses,
 * so both accessors in lib/auth/session.ts must agree with it exactly.
 */
export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}
