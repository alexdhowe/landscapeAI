/**
 * One place that turns a price book failure into a status code, so every
 * route in this folder answers the same way.
 */
import { NextResponse } from "next/server";

import { PriceBookEditError } from "@/lib/pricebook/mutate";
import { ParseError } from "@/lib/pricebook/parse";
import { NotPublishableError, PriceBookUnavailableError } from "@/lib/pricebook/service";

export function pricebookError(error: unknown): NextResponse {
  // No database: the book is the seed file and cannot be edited at all.
  if (error instanceof PriceBookUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 501 });
  }
  if (error instanceof ParseError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // The edit would leave the book referring to something that isn't there.
  if (error instanceof PriceBookEditError) {
    return NextResponse.json(
      { error: error.message, conflicts: error.conflicts },
      { status: 409 },
    );
  }
  if (error instanceof NotPublishableError) {
    return NextResponse.json(
      { error: error.message, issues: error.issues },
      { status: 422 },
    );
  }
  throw error;
}
