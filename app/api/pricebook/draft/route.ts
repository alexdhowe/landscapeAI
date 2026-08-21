import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { discardDraft, readDraftView, startDraft } from "@/lib/pricebook/service";

import { pricebookError } from "../errors";

/** POST → open a draft, copying the current published book. Idempotent. */
export async function POST(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  try {
    await startDraft(auth.contractor.name || auth.contractor.email);
    return NextResponse.json(await readDraftView(), { status: 201 });
  } catch (error) {
    return pricebookError(error);
  }
}

/**
 * DELETE → throw the draft away.
 *
 * Safe by construction: the published book is a different set of rows and
 * this never touches it.
 */
export async function DELETE(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  try {
    const discarded = await discardDraft();
    if (!discarded) {
      return NextResponse.json({ error: "There is no draft to discard" }, { status: 404 });
    }
    return NextResponse.json(await readDraftView());
  } catch (error) {
    return pricebookError(error);
  }
}
