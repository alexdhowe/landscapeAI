import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { readDraftView } from "@/lib/pricebook/service";

import { pricebookError } from "./errors";

/**
 * GET → the price book editing surface: the open draft (or the published
 * book, read-only, when there isn't one), what is wrong with it, and what
 * publishing would change.
 *
 * An ADMIN surface. This is cost, burden and margin in full.
 */
export async function GET(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await readDraftView());
  } catch (error) {
    return pricebookError(error);
  }
}
