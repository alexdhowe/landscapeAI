import { NextResponse } from "next/server";

import { requireContractor } from "@/lib/auth/guard";
import { readHistory } from "@/lib/pricebook/service";

import { pricebookError } from "../errors";

/**
 * GET → every revision, newest first, each with the diff against the one
 * before it.
 *
 * Revisions are immutable, so that diff IS the edit history: there is no
 * separate audit log that could drift from the rows it claims to describe.
 */
export async function GET(request: Request) {
  const auth = await requireContractor(request, "admin");
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await readHistory());
  } catch (error) {
    return pricebookError(error);
  }
}
