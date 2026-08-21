import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { updateSettings } from "@/lib/pricebook/mutate";
import { parseMargin, parsePolicy } from "@/lib/pricebook/parse";
import { editDraft } from "@/lib/pricebook/service";

import { pricebookError } from "../errors";

/**
 * PATCH { margin?, bandPolicy?, finalQuotePolicy? } → the numbers that
 * apply to every job rather than to one line.
 *
 * `showUnitRates` is not settable here or anywhere: it is typed `false` and
 * forced `false` on the way in. A disclosure policy is not a place a
 * contractor gets to decide to show costs to a customer.
 */
export async function PATCH(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateSettings>[1] = {};
    if (body.margin !== undefined) {
      patch.margin = parseMargin(body.margin) as never;
    }
    if (body.bandPolicy !== undefined) {
      patch.bandPolicy = parsePolicy(body.bandPolicy) as never;
    }
    if (body.finalQuotePolicy !== undefined) {
      patch.finalQuotePolicy = parsePolicy(body.finalQuotePolicy) as never;
    }
    const view = await editDraft(auth.contractor.name || auth.contractor.email, (config) =>
      updateSettings(config, patch),
    );
    return NextResponse.json(view);
  } catch (error) {
    return pricebookError(error);
  }
}
