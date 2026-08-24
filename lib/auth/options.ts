/**
 * What Auth.js is configured with — as data, with no Auth.js wiring.
 *
 * Split out of config.ts so it can be unit-tested: that module calls
 * `NextAuth()` at import time, which pulls in `next/server` and cannot be
 * loaded by a browser-free `npm test`. The setting that decides whether
 * anyone can sign in at all had therefore never been asserted anywhere —
 * see `__tests__/config.test.ts` for what that cost.
 *
 * Server-only.
 */
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authSecret } from "./secret";
import type { Contractor } from "./types";
import { authenticate } from "./users";

/**
 * Built per request rather than at import time, so a missing AUTH_SECRET
 * fails the first request loudly instead of failing `next build`. Building
 * is not running: a CI image has no business holding the production
 * secret.
 */
export function authConfig(): NextAuthConfig {
  return {
    secret: authSecret(),
    /**
     * Trust the Host header this app is served under.
     *
     * Auth.js refuses to build a callback URL from an untrusted host
     * unless it can recognise the platform it is on, and the only platform
     * it recognises automatically is Vercel. This app has no Vercel path:
     * it ships as a Dockerfile, `render.yaml`, `fly.toml`, or `npm start`
     * on a laptop — all self-hosted, all needing this. Without it every
     * request to /api/auth/* throws `UntrustedHost` and the console cannot
     * be signed into at all, which is exactly what happened: eleven
     * sessions shipped a login nobody could use, because the one command
     * that ever exercised it (`npm run shots`, in the README) passed
     * AUTH_TRUST_HOST=1 on the command line and no other path set it.
     *
     * What it costs: Auth.js will believe the Host/X-Forwarded-Host header
     * when it constructs URLs. That matters for OAuth redirects, and there
     * are none here — the single provider is credentials, checked
     * server-side, and the session cookie is host-only and SameSite. A
     * forged Host cannot redirect a token anywhere, because no token is
     * ever redirected.
     */
    trustHost: true,
    session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
    pages: { signIn: "/login" },
    providers: [
      Credentials({
        name: "Contractor login",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = credentials?.email;
          const password = credentials?.password;
          if (typeof email !== "string" || typeof password !== "string") return null;
          const contractor = await authenticate(email, password);
          if (!contractor) return null;
          return {
            id: contractor.id,
            email: contractor.email,
            name: contractor.name,
            role: contractor.role,
            orgId: contractor.orgId,
          };
        },
      }),
    ],
    callbacks: {
      /** Carry the tenant and role on the token; they are what surfaces gate on. */
      jwt({ token, user }) {
        if (user) {
          const contractor = user as Partial<Contractor>;
          token.role = contractor.role;
          token.orgId = contractor.orgId;
        }
        return token;
      },
      session({ session, token }) {
        if (session.user) {
          session.user.id = String(token.sub ?? "");
          session.user.role = token.role;
          session.user.orgId = token.orgId;
        }
        return session;
      },
    },
  };
}
