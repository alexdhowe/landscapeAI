/**
 * Minting a real contractor session for tests.
 *
 * Encodes the same JWT, with the same secret and salt, that a browser
 * would carry after signing in — so a test exercises the actual guard
 * rather than a stub of it. If the cookie name or the secret derivation
 * ever changes, these helpers break, which is the point.
 */
import { encode } from "next-auth/jwt";

import { authSecret, sessionCookieName } from "../secret";
import type { ContractorRole } from "../types";

export type TestContractor = {
  id?: string;
  email?: string;
  name?: string;
  role?: ContractorRole;
  orgId?: string;
};

/** A Cookie header carrying a valid session for this contractor. */
export async function contractorCookie(
  contractor: TestContractor = {},
): Promise<string> {
  const salt = sessionCookieName();
  const token = await encode({
    salt,
    secret: authSecret(),
    token: {
      sub: contractor.id ?? "11111111-2222-4333-8444-555555555555",
      email: contractor.email ?? "sam@example.com",
      name: contractor.name ?? "Sam Rep",
      role: contractor.role ?? "rep",
      orgId: contractor.orgId ?? "wi-reference",
    },
  });
  return `${salt}=${encodeURIComponent(token)}`;
}

/** Request headers for an authenticated contractor call. */
export async function contractorHeaders(
  contractor: TestContractor = {},
): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    cookie: await contractorCookie(contractor),
  };
}
