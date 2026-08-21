/**
 * The authorization gate for contractor API routes.
 *
 * project-map section 1: "Never render internal line items to a customer
 * surface." A route that mints a MeasurementDelta or issues a quote is not
 * a customer surface — it is the contractor acting on a lead — and until
 * this existed, anyone who could guess a project id could do both.
 *
 * Returns either the contractor or the 401 to return. Callers must not
 * continue past a Response.
 *
 * Server-only.
 */
import { NextResponse } from "next/server";

import { contractorFromRequest } from "./session";
import type { Contractor, ContractorRole } from "./types";

export type Authorized = { contractor: Contractor; response?: never };
export type Unauthorized = { contractor?: never; response: NextResponse };

/**
 * Require a signed-in contractor.
 *
 * 401 rather than a redirect: these are API routes called with fetch from
 * the console, and a redirect to an HTML login page in a JSON response is
 * a worse error than the truth.
 */
export async function requireContractor(
  request: Request,
  role?: ContractorRole,
): Promise<Authorized | Unauthorized> {
  const contractor = await contractorFromRequest(request);
  if (!contractor) {
    return {
      response: NextResponse.json(
        { error: "Sign in to the contractor console to do that" },
        { status: 401 },
      ),
    };
  }
  if (role === "admin" && contractor.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "That action needs an admin account" },
        { status: 403 },
      ),
    };
  }
  return { contractor };
}
