/**
 * Auth.js configuration (project-map section 3).
 *
 * Contractor side only — customers stay anonymous and are identified by
 * the email they leave on a lead, never by an account. One provider:
 * email and password, checked against lib/auth/users.ts.
 *
 * Sessions are JWTs in a cookie rather than rows, because the only thing
 * the session carries is an identity the database can re-check at any
 * time, and a session table would be one more thing to migrate for no
 * authorization benefit at this size.
 *
 * Server-only.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
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

export const { handlers, auth, signIn, signOut } = NextAuth(() => authConfig());
