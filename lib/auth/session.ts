/**
 * Reading the current contractor.
 *
 * One session — the Auth.js cookie — with two accessors, because the two
 * places that need it have different things in hand:
 *
 *   currentContractor()          server components. Reads the request
 *                                through next/headers, via Auth.js.
 *   contractorFromRequest(req)   route handlers. Reads the Cookie header
 *                                off the Request they were given.
 *
 * Both decode the same JWT with the same secret and salt, so there is one
 * thing to get right and one thing to revoke. The second exists because a
 * route handler already has the request, and reaching back through
 * next/headers to re-derive what was passed in makes the handler
 * untestable for no benefit.
 *
 * Server-only.
 */
import { decode } from "next-auth/jwt";

import { authSecret, sessionCookieNames } from "./secret";
import type { Contractor, ContractorRole } from "./types";

/** Pull one cookie out of a Cookie header without pulling in a parser. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(pair.slice(eq + 1).trim());
  }
  return null;
}

function toContractor(token: Record<string, unknown> | null): Contractor | null {
  if (!token) return null;
  const { sub, email, name, role, orgId } = token as {
    sub?: string;
    email?: string;
    name?: string;
    role?: ContractorRole;
    orgId?: string;
  };
  if (!sub || !orgId) return null;
  return {
    id: sub,
    email: email ?? "",
    name: name ?? "",
    role: role ?? "rep",
    orgId,
  };
}

/** The contractor behind a route-handler request, or null. */
export async function contractorFromRequest(
  request: Request,
): Promise<Contractor | null> {
  const header = request.headers.get("cookie");
  // Both names Auth.js might have written under — it picks the __Secure-
  // prefix from the request scheme, not from NODE_ENV. See
  // sessionCookieNames() for what that cost. The name is also the JWE
  // salt, so a token only decodes under the name it was written with.
  for (const name of sessionCookieNames()) {
    const raw = readCookie(header, name);
    if (!raw) continue;
    try {
      const contractor = toContractor(
        (await decode({ token: raw, secret: authSecret(), salt: name })) as Record<
          string,
          unknown
        > | null,
      );
      if (contractor) return contractor;
    } catch {
      // A tampered, expired, or foreign-secret token is simply not a
      // session. Keep looking: the other cookie may still be one.
    }
  }
  return null;
}

/** The contractor in a server component, or null. */
export async function currentContractor(): Promise<Contractor | null> {
  const { auth } = await import("./config");
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role ?? "rep",
    orgId: session.user.orgId,
  };
}
