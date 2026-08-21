import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { publishDraft } from "@/lib/pricebook/service";

import { pricebookError } from "../errors";

/**
 * POST { label?, note? } → publish the draft.
 *
 * The gate. Past it the revision is frozen and every new estimate prices
 * from it, so lib/pricebook/validate.ts has to come back clean — including
 * the catalog guardrail, which is the one that stops a customer being
 * offered something the engine cannot price.
 */
export async function POST(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;

  let body: { label?: unknown; note?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // A publish with no label is fine.
  }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : undefined;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : undefined;

  try {
    const revision = await publishDraft(
      auth.contractor.name || auth.contractor.email,
      { ...(label ? { label } : {}), ...(note ? { note } : {}) },
    );
    return NextResponse.json(revision, { status: 201 });
  } catch (error) {
    return pricebookError(error);
  }
}
