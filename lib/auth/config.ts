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
 * The configuration itself lives in ./options — this module is only the
 * Auth.js wiring, and `NextAuth()` cannot be imported by the test suite.
 *
 * Server-only.
 */
import NextAuth from "next-auth";

import { authConfig } from "./options";

export { authConfig };

export const { handlers, auth, signIn, signOut } = NextAuth(() => authConfig());
